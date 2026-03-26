import { getCurrentDrawSlotFromAdmin } from '@/lib/draw-slot';
import {
  hasProofHistorySlot,
  prependProofHistoryItem,
  readProofHistory,
} from '@/lib/proof-history';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import {
  getProofWinnerCycle,
  setProofWinnerCycle,
  withProofWinnerCycleLock,
} from '@/lib/proof-winner-cycle';

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';

const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';

const HELIUS_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
const BAGS_API_KEY = process.env.BAGS_API_KEY!;
const BAGS_BASE_URL =
  process.env.BAGS_BASE_URL || 'https://public-api-v2.bags.fm/api/v1';
const DEV_WALLET = process.env.RANDO_DEV_WALLET!;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;
const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY!;
const ALLOW_UNSAFE_DRAW_TESTS = process.env.ALLOW_UNSAFE_DRAW_TESTS === '1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

type Holder = {
  owner: string;
  uiAmount: number;
};

type BagsClaimablePosition = {
  baseMint?: string;
  totalClaimableLamportsUserShare?: number;
};

type BagsPreparedTransaction = {
  transaction: string;
  blockhash?: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
};

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function formatSolAmount(value: number) {
  return Number(value.toFixed(9));
}

function lamportsToSol(value: number) {
  return value / 1_000_000_000;
}

function getRequestOptions(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';
  const testId = searchParams.get('testId')?.trim() || null;
  const simulateDisqualification =
    searchParams.get('simulateDisqualification') === '1';
  const simulatePayoutReady = searchParams.get('simulatePayoutReady') === '1';

  return { force, testId, simulateDisqualification, simulatePayoutReady };
}

function buildUniqueManualTestId() {
  return `manual-${Date.now()}`;
}

function buildSlotId(slotId: string, force: boolean, testId: string | null) {
  if (!force) {
    return slotId;
  }

  if (testId) {
    return `${slotId}-forced-${testId}`;
  }

  return `${slotId}-forced`;
}

function isAuthorizedRequest(request: Request) {
  const headerValue = request.headers.get('x-rando-admin-key');

  if (!RANDO_ADMIN_API_KEY) {
    throw new Error('Missing RANDO_ADMIN_API_KEY environment variable');
  }

  return headerValue === RANDO_ADMIN_API_KEY;
}

function assertSafeProductionRequest(request: Request) {
  const { force, testId, simulateDisqualification, simulatePayoutReady } =
    getRequestOptions(request);

  const isUnsafeTestRequest =
    force || Boolean(testId) || simulateDisqualification || simulatePayoutReady;

  if (IS_PRODUCTION && !ALLOW_UNSAFE_DRAW_TESTS && isUnsafeTestRequest) {
    throw new Error(
      'Production safety block: force/test/simulate draw options are disabled'
    );
  }
}

function getSignerKeypair() {
  if (!SOLANA_PRIVATE_KEY) {
    throw new Error('Missing SOLANA_PRIVATE_KEY environment variable');
  }

  const signer = Keypair.fromSecretKey(bs58.decode(SOLANA_PRIVATE_KEY));

  if (signer.publicKey.toBase58() !== DEV_WALLET) {
    throw new Error(
      `SOLANA_PRIVATE_KEY does not match RANDO_DEV_WALLET. Expected ${DEV_WALLET}, got ${signer.publicKey.toBase58()}`
    );
  }

  return signer;
}

function decodePreparedTransaction(serialized: string) {
  const trimmed = serialized.trim();

  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return Buffer.from(bs58.decode(trimmed));
  }

  return Buffer.from(trimmed, 'base64');
}

async function signAndSendPreparedTransactions(
  preparedTransactions: BagsPreparedTransaction[]
) {
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const signer = getSignerKeypair();
  const signatures: string[] = [];

  for (const prepared of preparedTransactions) {
    if (!prepared?.transaction) {
      throw new Error('Bags returned a transaction entry without transaction data');
    }

    const rawBytes = decodePreparedTransaction(prepared.transaction);
    const transaction = VersionedTransaction.deserialize(rawBytes);

    transaction.sign([signer]);

    const signature = await connection.sendRawTransaction(
      Buffer.from(transaction.serialize()),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    if (prepared.blockhash?.blockhash && prepared.blockhash.lastValidBlockHeight) {
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.blockhash.blockhash,
          lastValidBlockHeight: prepared.blockhash.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction ${signature} failed confirmation: ${JSON.stringify(
            confirmation.value.err
          )}`
        );
      }
    } else {
      const confirmation = await connection.confirmTransaction(
        signature,
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction ${signature} failed confirmation: ${JSON.stringify(
            confirmation.value.err
          )}`
        );
      }
    }

    signatures.push(signature);
  }

  return signatures;
}

async function updateBagsFeeRecipients(winnerWallet: string) {
  console.log('[BAGS] Updating fee recipients...');

  const payload = {
    baseMint: TOKEN_MINT,
    payer: DEV_WALLET,
    basisPointsArray: [5000, 5000],
    claimersArray: [DEV_WALLET, winnerWallet],
  };

  console.log('[BAGS] Payload:', payload);

  const res = await fetch(`${BAGS_BASE_URL}/fee-share/admin/update-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BAGS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  console.log('[BAGS] Raw response:', json);

  if (!res.ok || !json.success) {
    throw new Error(
      json.error || JSON.stringify(json) || 'Bags update-config failed'
    );
  }

  const transactions: BagsPreparedTransaction[] = Array.isArray(
    json.response?.transactions
  )
    ? json.response.transactions
    : [];

  console.log('[BAGS] Transactions received:', transactions.length);

  if (transactions.length === 0) {
    return [];
  }

  const signatures = await signAndSendPreparedTransactions(transactions);

  console.log('[BAGS] Config update signatures:', signatures);

  return signatures;
}

async function claimBagsFees(feeClaimer: string) {
  const response = await fetch(`${BAGS_BASE_URL}/token-launch/claim-txs/v3`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': BAGS_API_KEY,
    },
    body: JSON.stringify({ feeClaimer, tokenMint: TOKEN_MINT }),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(json.error || JSON.stringify(json) || 'Bags claim-txs/v3 failed');
  }

  let prepared: BagsPreparedTransaction[] = [];

  if (Array.isArray(json.response)) {
    prepared = json.response;
  } else if (Array.isArray(json.response?.transactions)) {
    prepared = json.response.transactions;
  } else {
    console.error('[BAGS CLAIM INVALID SHAPE]', json.response);
    throw new Error('Unexpected Bags claim response shape');
  }

  prepared = prepared
    .map((tx) => {
      if (tx?.transaction) return tx;
      if ((tx as any)?.tx) {
        return {
          ...tx,
          transaction: (tx as any).tx,
        };
      }
      return null;
    })
    .filter((tx): tx is BagsPreparedTransaction => Boolean(tx?.transaction));

  if (prepared.length === 0) {
    throw new Error('Bags returned no valid transactions to sign');
  }

  return signAndSendPreparedTransactions(prepared);
}

async function getBagsClaimableSol(wallet: string): Promise<number> {
  const url = new URL(`${BAGS_BASE_URL}/token-launch/claimable-positions`);
  url.searchParams.set('wallet', wallet);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': BAGS_API_KEY,
    },
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || JSON.stringify(json) || 'Bags claimable-positions failed'
    );
  }

  const positions: BagsClaimablePosition[] = Array.isArray(json.response)
    ? json.response
    : [];

  const totalLamports = positions
    .filter((position) => position.baseMint === TOKEN_MINT)
    .reduce((sum, position) => {
      return sum + Number(position.totalClaimableLamportsUserShare || 0);
    }, 0);

  return lamportsToSol(totalLamports);
}

async function filterSystemOwnedWallets(holders: Holder[]) {
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const valid: Holder[] = [];

  for (let i = 0; i < holders.length; i += 100) {
    const chunk = holders.slice(i, i + 100);

    const pubkeys = chunk.map((holder) => new PublicKey(holder.owner));
    const accounts = await connection.getMultipleAccountsInfo(pubkeys);

    for (let j = 0; j < chunk.length; j++) {
      const holder = chunk[j];
      const accountInfo = accounts[j];

      if (!accountInfo) {
        continue;
      }

      if (accountInfo.owner.equals(SystemProgram.programId)) {
        valid.push(holder);
      }
    }
  }

  return valid;
}

async function getCurrentUiAmountForOwner(
  owner: string,
  decimals: number
): Promise<number> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `owner-balances-${owner}`,
      method: 'getTokenAccountsByOwner',
      params: [
        owner,
        { mint: TOKEN_MINT },
        {
          encoding: 'jsonParsed',
        },
      ],
    }),
  });

  const data = await response.json();
  const accounts = data?.result?.value ?? [];

  let totalRaw = 0;

  for (const account of accounts) {
    const rawAmount = Number(
      account?.account?.data?.parsed?.info?.tokenAmount?.amount || 0
    );
    totalRaw += rawAmount;
  }

  return totalRaw / Math.pow(10, decimals);
}

function getBlockedRecentWinners(history: Awaited<ReturnType<typeof readProofHistory>>) {
  const uniqueWinners: string[] = [];

  for (const item of history) {
    const owner = item.winner?.owner;
    if (!owner) continue;

    if (!uniqueWinners.includes(owner)) {
      uniqueWinners.push(owner);
    }

    if (uniqueWinners.length >= 3) {
      break;
    }
  }

  return uniqueWinners.slice(0, 3);
}

async function pickValidatedWinner(
  eligible: Holder[],
  decimals: number,
  minTokens: number,
  excludedOwners: string[] = []
): Promise<{
  winner: Holder;
  winnerIndex: number;
  validatedUiAmount: number;
  rerolls: number;
}> {
  const excludedSet = new Set(excludedOwners);
  const remaining = eligible.filter((holder) => !excludedSet.has(holder.owner));
  let rerolls = 0;

  while (remaining.length > 0) {
    const randomIndex = Math.floor(Math.random() * remaining.length);
    const candidate = remaining[randomIndex];

    const validatedUiAmount = await getCurrentUiAmountForOwner(
      candidate.owner,
      decimals
    );

    if (validatedUiAmount >= minTokens) {
      return {
        winner: {
          owner: candidate.owner,
          uiAmount: validatedUiAmount,
        },
        winnerIndex: eligible.findIndex(
          (holder) => holder.owner === candidate.owner
        ),
        validatedUiAmount,
        rerolls,
      };
    }

    remaining.splice(randomIndex, 1);
    rerolls++;
  }

  throw new Error('No eligible holders remained above threshold during validation');
}

async function validateActiveWinner(
  activeWinnerWallet: string,
  decimals: number,
  minTokens: number,
  simulateDisqualification: boolean
): Promise<{
  stillEligible: boolean;
  validatedUiAmount: number;
}> {
  const validatedUiAmount = await getCurrentUiAmountForOwner(
    activeWinnerWallet,
    decimals
  );

  if (simulateDisqualification) {
    return {
      stillEligible: false,
      validatedUiAmount,
    };
  }

  return {
    stillEligible: validatedUiAmount >= minTokens,
    validatedUiAmount,
  };
}

async function runDraw(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return Response.json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }

  assertSafeProductionRequest(request);

  const config = await getDrawAdminConfig();
  const minTokens = config.minTokens;
  const minPayoutSol = config.minPayoutSol;
  const excludedWallets = config.excludedWallets;

  const snapshotAt = new Date().toISOString();
  const currentSlot = await getCurrentDrawSlotFromAdmin(new Date());
  const { force, testId, simulateDisqualification, simulatePayoutReady } =
    getRequestOptions(request);

  const effectiveForce = force;
  const effectiveTestId =
    effectiveForce && !currentSlot.isDue
      ? testId || buildUniqueManualTestId()
      : testId;

  if (!effectiveForce && !currentSlot.isDue) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: 'Current draw slot is not due yet',
      slot: {
        slotId: currentSlot.slotId,
        drawIndex: currentSlot.drawIndex,
        scheduledDrawAt: currentSlot.nextDrawAtIso,
        previousDrawAtIso: currentSlot.previousDrawAtIso,
        currentIntervalHours: currentSlot.currentIntervalHours,
        isDue: currentSlot.isDue,
      },
    });
  }

  const slotIdToCheck = buildSlotId(
    currentSlot.slotId,
    effectiveForce,
    effectiveTestId
  );

  const existingSlot = await hasProofHistorySlot(slotIdToCheck);

  if (existingSlot) {
    return Response.json({
      ok: false,
      error: 'This scheduled draw slot has already been processed',
    });
  }

  const mintInfoResponse = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'mint-info',
      method: 'getAccountInfo',
      params: [TOKEN_MINT, { encoding: 'jsonParsed' }],
    }),
  });

  const mintInfoData = await mintInfoResponse.json();
  const decimals = mintInfoData?.result?.value?.data?.parsed?.info?.decimals;

  if (decimals === undefined) {
    throw new Error('Failed to fetch token decimals');
  }

  let allTokenAccounts: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `getTokenAccounts-${page}`,
        method: 'getTokenAccounts',
        params: {
          mint: TOKEN_MINT,
          page,
          limit: 1000,
        },
      }),
    });

    const data = await response.json();
    const items = data?.result?.token_accounts ?? [];

    allTokenAccounts.push(...items);

    if (items.length < 1000) {
      hasMore = false;
    } else {
      page++;
    }
  }

  const balancesByOwner: Record<string, number> = {};

  for (const acc of allTokenAccounts) {
    const owner = acc.owner;
    const rawAmount = Number(acc.amount || 0);

    if (!owner) continue;

    balancesByOwner[owner] = (balancesByOwner[owner] || 0) + rawAmount;
  }

  const holders: Holder[] = Object.entries(balancesByOwner).map(
    ([owner, totalRaw]) => ({
      owner,
      uiAmount: totalRaw / Math.pow(10, decimals),
    })
  );

  const nonExcludedHolders = holders.filter(
    (holder) => !excludedWallets.includes(holder.owner)
  );

  const thresholdEligible = nonExcludedHolders.filter(
    (holder) => holder.uiAmount >= minTokens
  );

  const eligible = await filterSystemOwnedWallets(thresholdEligible);

  const drawId = [
    'rando',
    TOKEN_MINT.slice(0, 6),
    snapshotAt.replace(/[:.]/g, '-'),
    eligible.length,
  ].join('-');

  if (eligible.length === 0) {
    return Response.json({
      ok: false,
      error: 'No eligible holders found after filtering system-owned accounts',
    });
  }

  const history = await readProofHistory();
  const blockedRecentWinners = getBlockedRecentWinners(history);

  const existingCycle = await getProofWinnerCycle();

  let winner: Holder;
  let winnerIndex = -1;
  let validatedUiAmount = 0;
  let rerollsDuringValidation = 0;
  let cycleAction = 'started-new-winner-cycle';
  let activeWinnerClaimableSol = existingCycle.lastKnownClaimableSol;
  let activeWinnerClaimCheckAt = existingCycle.lastClaimCheckAt;
  let totalClaimedSol = existingCycle.totalClaimedSol;
  let accumulatedSol = existingCycle.accumulatedSol;
  let targetReached = false;
  let configSignatures: string[] = [];
  let claimSignatures: string[] = [];
  let configUpdated = false;
  let claimTriggeredByApp = false;
  let manualPayoutPerformed = false;
  let keepExistingWinner = false;
  let disqualifiedPreviousWinner:
    | {
        owner: string;
        validatedUiAmount: number;
        minimumRequired: number;
        reason: string;
        disqualifiedAt: string;
        claimableSolAtCheck: number;
      }
    | null = null;
  let simulatedNextWinnerPreview:
    | {
        owner: string;
        uiAmount: number;
        winnerIndex: number;
      }
    | null = null;

  const currentCycleCanBeKept =
    existingCycle.status === 'active' &&
    existingCycle.activeWinnerWallet &&
    !existingCycle.targetReached &&
    existingCycle.activeWinnerWallet.length > 0;

  if (currentCycleCanBeKept) {
    const activeWinnerWallet = existingCycle.activeWinnerWallet!;

    activeWinnerClaimableSol = await getBagsClaimableSol(activeWinnerWallet);
    activeWinnerClaimCheckAt = snapshotAt;

    const inferredUserClaimedSol = Math.max(
      0,
      existingCycle.lastKnownClaimableSol - activeWinnerClaimableSol
    );

    totalClaimedSol = existingCycle.totalClaimedSol + inferredUserClaimedSol;
    accumulatedSol = totalClaimedSol + activeWinnerClaimableSol;

    const effectiveClaimableSol = simulatePayoutReady
      ? Math.max(activeWinnerClaimableSol, minPayoutSol)
      : activeWinnerClaimableSol;

    const activeWinnerValidation = await validateActiveWinner(
      activeWinnerWallet,
      decimals,
      minTokens,
      simulateDisqualification
    );

    if (!activeWinnerValidation.stillEligible) {
      disqualifiedPreviousWinner = {
        owner: activeWinnerWallet,
        validatedUiAmount: activeWinnerValidation.validatedUiAmount,
        minimumRequired: minTokens,
        reason: simulateDisqualification
          ? 'Safe test mode simulated disqualification preview'
          : 'Active winner dropped below minimum token threshold',
        disqualifiedAt: snapshotAt,
        claimableSolAtCheck: activeWinnerClaimableSol,
      };
    } else if (
      effectiveClaimableSol >= minPayoutSol &&
      !simulateDisqualification &&
      !simulatePayoutReady
    ) {
      claimSignatures = [];
      claimTriggeredByApp = false;
      manualPayoutPerformed = false;
      targetReached = true;
    } else if (
      effectiveClaimableSol >= minPayoutSol &&
      !simulateDisqualification &&
      simulatePayoutReady
    ) {
      claimTriggeredByApp = false;
      manualPayoutPerformed = false;
      targetReached = true;
      cycleAction = 'simulated-payout-ready-rotated-new-winner';
    } else {
      keepExistingWinner = true;
      cycleAction = 'kept-existing-winner-below-threshold';
      winner = {
        owner: activeWinnerWallet,
        uiAmount: activeWinnerValidation.validatedUiAmount,
      };
      winnerIndex = eligible.findIndex(
        (holder) => holder.owner === activeWinnerWallet
      );
      validatedUiAmount = activeWinnerValidation.validatedUiAmount;
      simulatedNextWinnerPreview = {
        owner: activeWinnerWallet,
        uiAmount: activeWinnerValidation.validatedUiAmount,
        winnerIndex,
      };
    }
  }

  if (!keepExistingWinner) {
    const exclusionOwners = [...blockedRecentWinners, ...excludedWallets];

    const validation = await pickValidatedWinner(
      eligible,
      decimals,
      minTokens,
      exclusionOwners
    );

    winner = validation.winner;
    winnerIndex = validation.winnerIndex;
    validatedUiAmount = validation.validatedUiAmount;
    rerollsDuringValidation = validation.rerolls;

    if (disqualifiedPreviousWinner) {
      cycleAction = simulateDisqualification
        ? 'simulated-disqualification-preview-only'
        : 'disqualified-and-rotated-new-winner';
    } else if (currentCycleCanBeKept && targetReached && simulatePayoutReady) {
      cycleAction = 'simulated-payout-ready-rotated-new-winner';
    } else if (currentCycleCanBeKept && targetReached) {
      cycleAction = 'threshold-reached-rotated-new-winner-no-app-claim';
    } else {
      cycleAction = 'started-new-winner-cycle';
    }
  }

  const shouldUpdateBagsRecipients =
    !keepExistingWinner &&
    !simulateDisqualification &&
    cycleAction !== 'simulated-disqualification-preview-only';

  if (shouldUpdateBagsRecipients) {
    configSignatures = await updateBagsFeeRecipients(winner.owner);
    configUpdated = configSignatures.length > 0;
  }

  const shouldPersistCycle =
    cycleAction !== 'simulated-disqualification-preview-only';

  let nextCycle = existingCycle;

  if (shouldPersistCycle) {
    if (keepExistingWinner) {
      nextCycle = await setProofWinnerCycle({
        tokenMint: TOKEN_MINT,
        activeWinnerWallet: winner.owner,
        cycleStartedAt: existingCycle.cycleStartedAt || snapshotAt,
        cycleCompletedAt: null,
        status: 'active',
        minPayoutSol,
        accumulatedSol,
        targetReached: false,
        lastDrawId: drawId,
        lastDisqualifiedWinnerWallet: existingCycle.lastDisqualifiedWinnerWallet,
        lastDisqualifiedWinnerAmount: existingCycle.lastDisqualifiedWinnerAmount,
        lastDisqualifiedAt: existingCycle.lastDisqualifiedAt,
        lastDisqualificationReason: existingCycle.lastDisqualificationReason,
        lastKnownClaimableSol: activeWinnerClaimableSol,
        totalClaimedSol,
        lastClaimCheckAt: activeWinnerClaimCheckAt || snapshotAt,
      });
    } else {
      nextCycle = await setProofWinnerCycle({
        tokenMint: TOKEN_MINT,
        activeWinnerWallet: winner.owner,
        cycleStartedAt: snapshotAt,
        cycleCompletedAt:
          cycleAction === 'threshold-reached-rotated-new-winner-no-app-claim'
            ? snapshotAt
            : null,
        status: 'active',
        minPayoutSol,
        accumulatedSol: targetReached ? 0 : accumulatedSol,
        targetReached: false,
        lastDrawId: drawId,
        lastDisqualifiedWinnerWallet:
          disqualifiedPreviousWinner?.owner ??
          existingCycle.lastDisqualifiedWinnerWallet,
        lastDisqualifiedWinnerAmount:
          disqualifiedPreviousWinner?.validatedUiAmount ??
          existingCycle.lastDisqualifiedWinnerAmount,
        lastDisqualifiedAt:
          disqualifiedPreviousWinner?.disqualifiedAt ??
          existingCycle.lastDisqualifiedAt,
        lastDisqualificationReason:
          disqualifiedPreviousWinner?.reason ??
          existingCycle.lastDisqualificationReason,
        lastKnownClaimableSol: 0,
        totalClaimedSol: targetReached ? 0 : totalClaimedSol,
        lastClaimCheckAt: activeWinnerClaimCheckAt || snapshotAt,
      });
    }
  }

  const responseBody = {
    ok: true,
    draw: {
      drawId,
      step:
        cycleAction === 'simulated-disqualification-preview-only'
          ? 'safe test mode disqualification preview only; no live winner-cycle, history, or Bags routing was changed'
          : cycleAction === 'threshold-reached-rotated-new-winner-no-app-claim'
            ? 'winner threshold reached; app rotated Bags recipient without triggering a manual claim'
            : cycleAction === 'kept-existing-winner-below-threshold'
              ? 'active winner is still eligible and below threshold, so the same winner was kept and continues accumulating'
              : simulatePayoutReady
                ? 'safe test mode simulated payout-ready rotation without claiming live Bags fees'
                : shouldUpdateBagsRecipients
                  ? 'winner selected and Bags config update transactions were signed and submitted'
                  : 'winner validated and existing active winner kept',
      snapshotAt,
      tokenMint: TOKEN_MINT,
      forced: effectiveForce,
      testId: effectiveTestId,
      cycleAction,
      simulateDisqualification,
      simulatePayoutReady,
      blockedRecentWinners,
    },
    rules: {
      decimals,
      minTokens,
      minPayoutSol,
      excludedWallets,
    },
    counts: {
      totalTokenAccounts: allTokenAccounts.length,
      totalHolders: holders.length,
      holderCountAfterExclusions: nonExcludedHolders.length,
      thresholdEligibleCount: thresholdEligible.length,
      eligibleCount: eligible.length,
      excludedWalletCount: excludedWallets.length,
      pagesScanned: page,
      rerollsDuringValidation,
    },
    proof: {
      eligibleWalletSample: eligible.slice(0, 5).map((holder) => ({
        owner: holder.owner,
        uiAmount: formatUiAmount(holder.uiAmount),
      })),
      topEligibleSample: [...eligible]
        .sort((a, b) => b.uiAmount - a.uiAmount)
        .slice(0, 5)
        .map((holder) => ({
          owner: holder.owner,
          uiAmount: formatUiAmount(holder.uiAmount),
        })),
      blockedRecentWinners,
      winnerValidation: {
        checkedOwner: winner.owner,
        validatedUiAmount: formatUiAmount(validatedUiAmount),
        minimumRequired: minTokens,
        passed: true,
      },
      disqualifiedPreviousWinner: disqualifiedPreviousWinner
        ? {
            owner: disqualifiedPreviousWinner.owner,
            validatedUiAmount: formatUiAmount(
              disqualifiedPreviousWinner.validatedUiAmount
            ),
            minimumRequired: disqualifiedPreviousWinner.minimumRequired,
            reason: disqualifiedPreviousWinner.reason,
            disqualifiedAt: disqualifiedPreviousWinner.disqualifiedAt,
            claimableSolAtCheck: formatSolAmount(
              disqualifiedPreviousWinner.claimableSolAtCheck
            ),
          }
        : null,
      simulatedNextWinnerPreview: simulatedNextWinnerPreview
        ? {
            owner: simulatedNextWinnerPreview.owner,
            uiAmount: formatUiAmount(simulatedNextWinnerPreview.uiAmount),
            winnerIndex: simulatedNextWinnerPreview.winnerIndex,
          }
        : null,
      winnerCycle: {
        activeWinnerWallet: nextCycle.activeWinnerWallet,
        cycleStartedAt: nextCycle.cycleStartedAt,
        cycleCompletedAt: nextCycle.cycleCompletedAt,
        status: nextCycle.status,
        minPayoutSol: nextCycle.minPayoutSol,
        accumulatedSol: formatSolAmount(nextCycle.accumulatedSol),
        targetReached: nextCycle.targetReached,
        lastKnownClaimableSol: formatSolAmount(nextCycle.lastKnownClaimableSol),
        totalClaimedSol: formatSolAmount(nextCycle.totalClaimedSol),
        lastClaimCheckAt: nextCycle.lastClaimCheckAt,
        explanation:
          'The active winner now stays in place until the minimum payout threshold is reached or the winner becomes ineligible.',
      },
    },
    slot: {
      slotId: slotIdToCheck,
      drawIndex: currentSlot.drawIndex,
      scheduledDrawAt: currentSlot.nextDrawAtIso,
      previousDrawAtIso: currentSlot.previousDrawAtIso,
      currentIntervalHours: currentSlot.currentIntervalHours,
      isDue: currentSlot.isDue,
      forced: effectiveForce,
      testId: effectiveTestId,
    },
    winner: {
      winnerIndex,
      owner: winner.owner,
      uiAmount: formatUiAmount(winner.uiAmount),
    },
    payout: {
      provider: 'bags',
      distributionModel: 'bags-managed',
      configUpdated,
      claimTriggeredByApp,
      manualPayoutPerformed,
      rotatingRole: 'winner',
      minimumPayoutSol: minPayoutSol,
      winnerKeepsAccumulatingUntilMinimumMet: true,
      simulated: simulateDisqualification || simulatePayoutReady,
      currentClaimableSolForActiveWinner: formatSolAmount(
        activeWinnerClaimableSol
      ),
      recipients: [
        {
          role: 'dev',
          wallet: DEV_WALLET,
          basisPoints: 5000,
        },
        {
          role: 'winner',
          wallet: nextCycle.activeWinnerWallet,
          basisPoints: 5000,
        },
      ],
      claimSignatures,
      configSignatures,
    },
  };

  if (cycleAction !== 'simulated-disqualification-preview-only') {
    await prependProofHistoryItem({
      drawId,
      snapshotAt,
      tokenMint: TOKEN_MINT,
      slotId: slotIdToCheck,
      scheduledDrawAt: currentSlot.nextDrawAtIso,
      winner: {
        owner: winner.owner,
        uiAmount: formatUiAmount(winner.uiAmount),
        winnerIndex,
      },
      counts: {
        totalTokenAccounts: allTokenAccounts.length,
        totalHolders: holders.length,
        holderCountAfterExclusions: nonExcludedHolders.length,
        eligibleCount: eligible.length,
        excludedWalletCount: excludedWallets.length,
        pagesScanned: page,
      },
    });
  }

  return Response.json(responseBody);
}

export async function GET() {
  return Response.json(
    {
      ok: false,
      error:
        'Method not allowed. Use POST for /api/proof/run-draw. GET is disabled for production safety.',
    },
    { status: 405 }
  );
}

export async function POST(request: Request) {
  try {
    return await withProofWinnerCycleLock(async () => {
      return await runDraw(request);
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}