import { getCurrentDrawSlot } from '@/lib/draw-slot';
import {
  hasProofHistorySlot,
  prependProofHistoryItem,
} from '@/lib/proof-history';

const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';

const HELIUS_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;

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

export async function GET() {
  try {
    const snapshotAt = new Date().toISOString();
    const currentSlot = getCurrentDrawSlot(new Date());

    // 🔒 NEW: block if draw is not due yet
    if (!currentSlot.isDue) {
      return Response.json({
        ok: false,
        error: 'Draw is not due yet',
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

    const existingSlot = await hasProofHistorySlot(currentSlot.slotId);

    if (existingSlot) {
      return Response.json({
        ok: false,
        error: 'This scheduled draw slot has already been processed',
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

    const mintInfoResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'mint-info',
        method: 'getAccountInfo',
        params: [
          TOKEN_MINT,
          {
            encoding: 'jsonParsed',
          },
        ],
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
        headers: {
          'Content-Type': 'application/json',
        },
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

      if (!balancesByOwner[owner]) {
        balancesByOwner[owner] = 0;
      }

      balancesByOwner[owner] += rawAmount;
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

    const eligibleWalletSample = eligible.slice(0, 10).map((holder) => ({
      owner: holder.owner,
      uiAmount: formatUiAmount(holder.uiAmount),
    }));

    const topEligibleSample = [...eligible]
      .sort((a, b) => b.uiAmount - a.uiAmount)
      .slice(0, 10)
      .map((holder) => ({
        owner: holder.owner,
        uiAmount: formatUiAmount(holder.uiAmount),
      }));

    if (eligible.length === 0) {
      return Response.json({
        ok: false,
        error: 'No eligible holders found',
        draw: {
          drawId,
          step: 'no eligible holders',
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
          eligibleCount: 0,
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
        proof: {
          eligibleWalletSample: [],
          topEligibleSample: [],
        },
      });
    }

    const randomIndex = Math.floor(Math.random() * eligible.length);
    const winner = eligible[randomIndex];

    const responseBody = {
      ok: true,
      draw: {
        drawId,
        step: 'winner selected',
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
      proof: {
        eligibleWalletSample,
        topEligibleSample,
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