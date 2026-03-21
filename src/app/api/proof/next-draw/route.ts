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
  if (!force) return slotId;
  return testId ? `${slotId}-forced-${testId}` : `${slotId}-forced`;
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

/**
 * 🔥 FIXED: ONLY REAL CLAIMERS (DEV + WINNER)
 */
async function updateBagsFeeRecipients(winnerWallet: string) {
  const claimersArray = [DEV_WALLET, winnerWallet];
  const basisPointsArray = [3400, 3300];

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
    throw new Error(json.error || 'Bags update-config failed');
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
  decimals: number
) {
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

  throw new Error('No eligible holders remained above threshold');
}

async function runDraw(request: Request) {
  const snapshotAt = new Date().toISOString();
  const currentSlot = getCurrentDrawSlot(new Date());
  const { force, testId } = getRequestOptions(request);

  const effectiveForce = true;
  const effectiveTestId =
    testId || buildUniqueManualTestId();

  const slotIdToCheck = buildSlotId(
    currentSlot.slotId,
    effectiveForce,
    effectiveTestId
  );

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

  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'getTokenAccounts',
      method: 'getTokenAccounts',
      params: {
        mint: TOKEN_MINT,
        page: 1,
        limit: 1000,
      },
    }),
  });

  const data = await response.json();
  const allTokenAccounts = data?.result?.token_accounts ?? [];

  const balancesByOwner: Record<string, number> = {};

  for (const acc of allTokenAccounts) {
    const owner = acc.owner;
    const rawAmount = Number(acc.amount || 0);
    if (!owner) continue;
    balancesByOwner[owner] =
      (balancesByOwner[owner] || 0) + rawAmount;
  }

  const holders: Holder[] = Object.entries(balancesByOwner).map(
    ([owner, totalRaw]) => ({
      owner,
      uiAmount: totalRaw / Math.pow(10, decimals),
    })
  );

  const eligible = await filterSystemOwnedWallets(
    holders.filter(
      (h) =>
        !EXCLUDED_WALLETS.includes(h.owner) &&
        h.uiAmount >= MIN_TOKENS
    )
  );

  const validation = await pickValidatedWinner(eligible, decimals);
  const winner = validation.winner;

  const txs = await updateBagsFeeRecipients(winner.owner);
  const signatures = await sendBagsTransactions(txs);

  return Response.json({
    ok: true,
    winner,
    signatures,
  });
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