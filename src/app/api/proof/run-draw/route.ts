import { getCurrentDrawSlot } from '@/lib/draw-slot';
import {
  hasProofHistorySlot,
  prependProofHistoryItem,
} from '@/lib/proof-history';

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
const BAGS_PAYER_WALLET = process.env.BAGS_PAYER_WALLET!;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;
const DEV_WALLET = process.env.RANDO_DEV_WALLET!;

const MIN_TOKENS = 1_000_000;

const EXCLUDED_WALLETS = [
  '4FMEhKstf4AnZi6bdnVb5wvcffWPCebsvthvkPYTzC99',
  'BJz5RFx9ycWZ9dVbRtsZq7h3L6XPWVDuDtbgEeJVBJMG',
];

type Holder = {
  owner: string;
  uiAmount: number;
};

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function getAdminKeypair() {
  const secretKey = bs58.decode(SOLANA_PRIVATE_KEY);
  return Keypair.fromSecretKey(secretKey);
}

function getRequestOptions(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === '1';
  const testId = searchParams.get('testId')?.trim() || null;

  return { force, testId };
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

async function sendBagsTransactions(transactions: string[]) {
  if (!transactions.length) {
    throw new Error('Bags returned no transactions to sign');
  }

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const keypair = getAdminKeypair();

  const signatures: string[] = [];

  for (const txBase58 of transactions) {
    const txBytes = bs58.decode(txBase58);
    const tx = VersionedTransaction.deserialize(txBytes);

    tx.sign([keypair]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    await connection.confirmTransaction(signature, 'confirmed');
    signatures.push(signature);
  }

  return signatures;
}

async function updateBagsFeeRecipients(winnerWallet: string) {
  const claimersArray = [DEV_WALLET, winnerWallet];
  const basisPointsArray = [5000, 5000];

  const response = await fetch(
    `${BAGS_BASE_URL}/fee-share/admin/update-config`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
      },
      body: JSON.stringify({
        baseMint: TOKEN_MINT,
        claimersArray,
        basisPointsArray,
        payer: BAGS_PAYER_WALLET,
        additionalLookupTables: [],
      }),
    }
  );

  const json = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(
      json.error || JSON.stringify(json) || 'Bags update-config failed'
    );
  }

  return (
    json.response?.transactions?.map(
      (item: { transaction: string }) => item.transaction
    ) || []
  );
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

async function pickValidatedWinner(
  eligible: Holder[],
  decimals: number
): Promise<{
  winner: Holder;
  winnerIndex: number;
  validatedUiAmount: number;
  rerolls: number;
}> {
  const remaining = [...eligible];
  let rerolls = 0;

  while (remaining.length > 0) {
    const randomIndex = Math.floor(Math.random() * remaining.length);
    const candidate = remaining[randomIndex];

    const validatedUiAmount = await getCurrentUiAmountForOwner(
      candidate.owner,
      decimals
    );

    if (validatedUiAmount >= MIN_TOKENS) {
      return {
        winner: {
          owner: candidate.owner,
          uiAmount: validatedUiAmount,
        },
        winnerIndex: randomIndex,
        validatedUiAmount,
        rerolls,
      };
    }

    remaining.splice(randomIndex, 1);
    rerolls++;
  }

  throw new Error('No eligible holders remained above threshold during validation');
}

async function runDraw(request: Request) {
  const snapshotAt = new Date().toISOString();
  const currentSlot = getCurrentDrawSlot(new Date());
  const { force, testId } = getRequestOptions(request);

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
    (holder) => !EXCLUDED_WALLETS.includes(holder.owner)
  );

  const thresholdEligible = nonExcludedHolders.filter(
    (holder) => holder.uiAmount >= MIN_TOKENS
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
      error: 'No eligible system-owned holders found',
    });
  }

  const validation = await pickValidatedWinner(eligible, decimals);
  const winner = validation.winner;

  const updateConfigTransactions = await updateBagsFeeRecipients(winner.owner);
  const configSignatures = await sendBagsTransactions(updateConfigTransactions);

  const responseBody = {
    ok: true,
    draw: {
      drawId,
      step: 'winner selected, validated, and Bags fee split updated',
      snapshotAt,
      tokenMint: TOKEN_MINT,
      forced: effectiveForce,
      testId: effectiveTestId,
    },
    rules: {
      decimals,
      minTokens: MIN_TOKENS,
      excludedWallets: EXCLUDED_WALLETS,
    },
    counts: {
      totalTokenAccounts: allTokenAccounts.length,
      totalHolders: holders.length,
      holderCountAfterExclusions: nonExcludedHolders.length,
      thresholdEligibleCount: thresholdEligible.length,
      eligibleCount: eligible.length,
      excludedWalletCount: EXCLUDED_WALLETS.length,
      pagesScanned: page,
      rerollsDuringValidation: validation.rerolls,
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
      winnerValidation: {
        checkedOwner: winner.owner,
        validatedUiAmount: formatUiAmount(validation.validatedUiAmount),
        minimumRequired: MIN_TOKENS,
        passed: true,
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
      winnerIndex: validation.winnerIndex,
      owner: winner.owner,
      uiAmount: formatUiAmount(winner.uiAmount),
    },
    payout: {
      provider: 'bags',
      distributionModel: 'bags-managed',
      configUpdated: true,
      claimTriggeredByApp: false,
      manualPayoutPerformed: false,
      rotatingRole: 'winner',
      recipients: [
        {
          role: 'dev',
          wallet: DEV_WALLET,
          basisPoints: 5000,
        },
        {
          role: 'winner',
          wallet: winner.owner,
          basisPoints: 5000,
        },
      ],
      configSignatures,
    },
  };

  await prependProofHistoryItem({
    drawId,
    snapshotAt,
    tokenMint: TOKEN_MINT,
    slotId: slotIdToCheck,
    scheduledDrawAt: currentSlot.nextDrawAtIso,
    winner: {
      owner: winner.owner,
      uiAmount: formatUiAmount(winner.uiAmount),
      winnerIndex: validation.winnerIndex,
    },
    counts: {
      totalTokenAccounts: allTokenAccounts.length,
      totalHolders: holders.length,
      holderCountAfterExclusions: nonExcludedHolders.length,
      eligibleCount: eligible.length,
      excludedWalletCount: EXCLUDED_WALLETS.length,
      pagesScanned: page,
    },
  });

  return Response.json(responseBody);
}

export async function GET(request: Request) {
  try {
    return await runDraw(request);
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}

export async function POST(request: Request) {
  try {
    return await runDraw(request);
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}