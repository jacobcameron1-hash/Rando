import { getCurrentDrawSlot } from '@/lib/draw-slot';
import {
  hasProofHistorySlot,
  prependProofHistoryItem,
} from '@/lib/proof-history';

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';

const HELIUS_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
const BAGS_API_KEY = process.env.BAGS_API_KEY!;
const BAGS_BASE_URL =
  process.env.BAGS_BASE_URL || 'https://public-api-v2.bags.fm/api/v1';
const BAGS_PAYER_WALLET = process.env.BAGS_PAYER_WALLET!;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;

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

function getKeypair() {
  const secretKey = bs58.decode(SOLANA_PRIVATE_KEY);
  return Keypair.fromSecretKey(secretKey);
}

async function sendBagsTransactions(transactions: string[]) {
  const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
  const keypair = getKeypair();

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

async function updateBagsFeeRecipient(winnerWallet: string) {
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
        claimersArray: [winnerWallet],
        basisPointsArray: [10000],
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

export async function GET() {
  try {
    const snapshotAt = new Date().toISOString();
    const currentSlot = getCurrentDrawSlot(new Date());

    if (!currentSlot.isDue) {
      return Response.json({
        ok: false,
        error: 'Draw is not due yet',
      });
    }

    const existingSlot = await hasProofHistorySlot(currentSlot.slotId);

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
    const decimals =
      mintInfoData?.result?.value?.data?.parsed?.info?.decimals;

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

    const eligible = nonExcludedHolders.filter(
      (holder) => holder.uiAmount >= MIN_TOKENS
    );

    const drawId = [
      'rando',
      TOKEN_MINT.slice(0, 6),
      snapshotAt.replace(/[:.]/g, '-'),
      eligible.length,
    ].join('-');

    if (eligible.length === 0) {
      return Response.json({
        ok: false,
        error: 'No eligible holders found',
      });
    }

    const randomIndex = Math.floor(Math.random() * eligible.length);
    const winner = eligible[randomIndex];

    const updateConfigTransactions = await updateBagsFeeRecipient(winner.owner);
    const signatures = await sendBagsTransactions(updateConfigTransactions);

    const responseBody = {
      ok: true,
      draw: {
        drawId,
        step: 'winner selected and payout config sent',
        snapshotAt,
        tokenMint: TOKEN_MINT,
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
        eligibleCount: eligible.length,
        excludedWalletCount: EXCLUDED_WALLETS.length,
        pagesScanned: page,
      },
      slot: {
        slotId: currentSlot.slotId,
        drawIndex: currentSlot.drawIndex,
        scheduledDrawAt: currentSlot.nextDrawAtIso,
        previousDrawAtIso: currentSlot.previousDrawAtIso,
        currentIntervalHours: currentSlot.currentIntervalHours,
        isDue: currentSlot.isDue,
      },
      winner: {
        winnerIndex: randomIndex,
        owner: winner.owner,
        uiAmount: formatUiAmount(winner.uiAmount),
      },
      payout: {
        provider: 'bags',
        feeRecipient: winner.owner,
        basisPoints: 10000,
        configUpdated: true,
        signatures,
      },
    };

    await prependProofHistoryItem({
      drawId,
      snapshotAt,
      tokenMint: TOKEN_MINT,
      slotId: currentSlot.slotId,
      scheduledDrawAt: currentSlot.nextDrawAtIso,
      winner: {
        owner: winner.owner,
        uiAmount: formatUiAmount(winner.uiAmount),
        winnerIndex: randomIndex,
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
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}

export async function POST() {
  return Response.json({
    ok: true,
    step: 'POST run-draw reached',
  });
}