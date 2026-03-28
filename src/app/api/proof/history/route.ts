import { readProofHistory } from '@/lib/proof-history';
import {
  getProofWinnerCycle,
  getRecentProofWinnerDisqualifications,
} from '@/lib/proof-winner-cycle';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';

const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';
const BAGS_FEE_SHARE_URL = `https://bags.fm/${TOKEN_MINT}`;

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function formatSolAmount(value: number) {
  return Number(value.toFixed(9));
}

export async function GET() {
  try {
    const [history, disqualifications, winnerCycle, config] =
      await Promise.all([
        readProofHistory(),
        getRecentProofWinnerDisqualifications(3),
        getProofWinnerCycle(),
        getDrawAdminConfig(),
      ]);

    const realWinnerHistory = history.filter(
      (item) => item.isWinnerEvent !== false
    );

    // Payouts are now tracked directly in proof_history via payout_signature.
    // Sum all recorded payout amounts for the total.
    const totalPayoutSol = realWinnerHistory.reduce(
      (sum, item) => sum + (item.payoutAmountSol ?? 0),
      0
    );
    const totalPayoutCount = realWinnerHistory.filter(
      (item) => item.payoutSignature
    ).length;

    const latestTen = realWinnerHistory.slice(0, 10).map((item) => {
      const sig = item.payoutSignature ?? null;
      const amountSol = item.payoutAmountSol ?? null;

      return {
        drawId: item.drawId,
        snapshotAt: item.snapshotAt,
        tokenMint: item.tokenMint,
        winner: item.winner,
        counts: item.counts,
        payout: sig
          ? {
              amountSol: formatSolAmount(amountSol ?? 0),
              signature: sig,
              timestamp: item.snapshotAt,
              solscanUrl: `https://solscan.io/tx/${sig}`,
            }
          : null,
      };
    });

    return Response.json(
      {
        ok: true,
        tokenMint: TOKEN_MINT,
        tokenMintSolscanUrl: `https://solscan.io/token/${TOKEN_MINT}`,
        bagsFeeShareUrl: BAGS_FEE_SHARE_URL,
        totalPayoutSol: formatSolAmount(totalPayoutSol),
        totalPayoutCount,
        history: latestTen,
        disqualifications: disqualifications.map((item) => ({
          id: item.id,
          wallet: item.wallet,
          tokenAmount: formatUiAmount(item.tokenAmount),
          reason: item.reason,
          disqualifiedAt: item.disqualifiedAt,
          claimableSolAtCheck: formatSolAmount(item.claimableSolAtCheck),
          createdAt: item.createdAt,
        })),
        winnerCycle: {
          activeWinnerWallet: winnerCycle.activeWinnerWallet,
          cycleStartedAt: winnerCycle.cycleStartedAt,
          cycleCompletedAt: winnerCycle.cycleCompletedAt,
          status: winnerCycle.status,
          minPayoutSol: formatSolAmount(winnerCycle.minPayoutSol),
          accumulatedSol: formatSolAmount(winnerCycle.accumulatedSol),
          targetReached: winnerCycle.targetReached,
          lastDrawId: winnerCycle.lastDrawId,
          lastUpdatedAt: winnerCycle.lastUpdatedAt,
          lastDisqualifiedWinnerWallet:
            winnerCycle.lastDisqualifiedWinnerWallet,
          lastDisqualifiedWinnerAmount: formatUiAmount(
            winnerCycle.lastDisqualifiedWinnerAmount
          ),
          lastDisqualifiedAt: winnerCycle.lastDisqualifiedAt,
          lastDisqualificationReason:
            winnerCycle.lastDisqualificationReason,
          lastKnownClaimableSol: formatSolAmount(
            winnerCycle.lastKnownClaimableSol
          ),
          totalClaimedSol: formatSolAmount(winnerCycle.totalClaimedSol),
          lastClaimCheckAt: winnerCycle.lastClaimCheckAt,
        },
        config: {
          initialIntervalHours: config.initialIntervalHours,
          minPayoutSol: formatSolAmount(config.minPayoutSol),
          minTokens: config.minTokens,
        },
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: err.message || 'Failed to read proof history',
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
