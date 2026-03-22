import { getCurrentDrawSlot } from '@/lib/draw-slot';
import {
  hasProofHistorySlot,
  prependProofHistoryItem,
} from '@/lib/proof-history';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';

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
  if (!force) return slotId;
  if (testId) return `${slotId}-forced-${testId}`;
  return `${slotId}-forced`;
}

async function sendBagsTransactions(transactions: string[]) {
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
    throw new Error('Bags update-config failed');
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

      if (!accountInfo) continue;

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
        { encoding: 'jsonParsed' },
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
  decimals: number,
  minTokens: number
) {
  const remaining = [...eligible];

  while (remaining.length > 0) {
    const index = Math.floor(Math.random() * remaining.length);
    const candidate = remaining[index];

    const validated = await getCurrentUiAmountForOwner(
      candidate.owner,
      decimals
    );

    if (validated >= minTokens) {
      return {
        winner: { owner: candidate.owner, uiAmount: validated },
        winnerIndex: index,
      };
    }

    remaining.splice(index, 1);
  }

  throw new Error('No eligible holders after validation');
}

async function runDraw(request: Request) {
  const config = await getDrawAdminConfig();
  const MIN_TOKENS = config.minTokens;
  const EXCLUDED_WALLETS = config.excludedWallets;

  const snapshotAt = new Date().toISOString();
  const currentSlot = getCurrentDrawSlot(new Date());
  const { force, testId } = getRequestOptions(request);

  if (!force && !currentSlot.isDue) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: 'Not due',
    });
  }

  const slotId = buildSlotId(currentSlot.slotId, force, testId);

  if (await hasProofHistorySlot(slotId)) {
    return Response.json({ ok: false, error: 'Already processed' });
  }

  const mintInfo = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'mint-info',
      method: 'getAccountInfo',
      params: [TOKEN_MINT, { encoding: 'jsonParsed' }],
    }),
  });

  const mintData = await mintInfo.json();
  const decimals = mintData?.result?.value?.data?.parsed?.info?.decimals;

  let accounts: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `page-${page}`,
        method: 'getTokenAccounts',
        params: { mint: TOKEN_MINT, page, limit: 1000 },
      }),
    });

    const data = await res.json();
    const items = data?.result?.token_accounts ?? [];

    accounts.push(...items);

    if (items.length < 1000) hasMore = false;
    else page++;
  }

  const balances: Record<string, number> = {};

  for (const acc of accounts) {
    const owner = acc.owner;
    const raw = Number(acc.amount || 0);
    if (!owner) continue;
    balances[owner] = (balances[owner] || 0) + raw;
  }

  const holders: Holder[] = Object.entries(balances).map(([owner, raw]) => ({
    owner,
    uiAmount: raw / Math.pow(10, decimals),
  }));

  const eligible = await filterSystemOwnedWallets(
    holders
      .filter((h) => !EXCLUDED_WALLETS.includes(h.owner))
      .filter((h) => h.uiAmount >= MIN_TOKENS)
  );

  if (!eligible.length) {
    return Response.json({ ok: false, error: 'No eligible wallets' });
  }

  const result = await pickValidatedWinner(
    eligible,
    decimals,
    MIN_TOKENS
  );

  const txs = await updateBagsFeeRecipients(result.winner.owner);
  const sigs = await sendBagsTransactions(txs);

  await prependProofHistoryItem({
    drawId: `rando-${Date.now()}`,
    snapshotAt,
    tokenMint: TOKEN_MINT,
    slotId,
    scheduledDrawAt: currentSlot.nextDrawAtIso,
    winner: {
      owner: result.winner.owner,
      uiAmount: result.winner.uiAmount,
      winnerIndex: result.winnerIndex,
    },
    counts: {
      totalTokenAccounts: accounts.length,
      totalHolders: holders.length,
      holderCountAfterExclusions: holders.length,
      eligibleCount: eligible.length,
      excludedWalletCount: EXCLUDED_WALLETS.length,
      pagesScanned: page,
    },
  });

  return Response.json({
    ok: true,
    winner: result.winner,
    configUsed: config,
    signatures: sigs,
  });
}

export async function GET(req: Request) {
  return runDraw(req);
}

export async function POST(req: Request) {
  return runDraw(req);
}