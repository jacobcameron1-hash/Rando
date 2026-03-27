import { readProofHistory } from '@/lib/proof-history';
import {
  getProofWinnerCycle,
  getRecentProofWinnerDisqualifications,
} from '@/lib/proof-winner-cycle';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import {
  getAllWinnerClaimEvents,
  getTotalWinnerPayoutSol,
  findClaimForCycle,
} from '@/lib/bags-claim-events';

const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';
const BAGS_FEE_SHARE_URL = `https://solscan.io/account/${TOKEN_MINT}`;

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function formatSolAmount(value: number) {
  return Number(value.toFixed(9));
}

export async function GET() {
  try {
    const [
      history,
      disqualifications,
      winnerCycle,
      config,
      claimEvents,
      totalPayoutSol,
    ] = await Promise.all([
      readProofHistory(),
      getRecentProofWinnerDisqualifications(3),
      getProofWinnerCycle(),
      getDrawAdminConfig(),
      getAllWinnerClaimEvents(),
      getTotalWinnerPayoutSol(),
    ]);

    const realWinnerHistory = history.filter(
      (item) => item.isWinnerEvent !== false
    );

    const latestTen = realWinnerHistory.slice(0, 10).map((item) => {
      const claim = findClaimForCycle(
        claimEvents,
        item.winner?.owner,
        item.snapshotAt
      );

      return {
        drawId: item.drawId,
        snapshotAt: item.snapshotAt,
        tokenMint: item.tokenMint,
        winner: item.winner,
        counts: item.counts,
        payout: claim
          ? {
              amountSol: formatSolAmount(claim.amountSol),
              signature: claim.signature,
              timestamp: claim.timestamp,
              solscanUrl: `https://solscan.io/tx/${claim.signature}`,
            }
          : null,
      };
    });

    return Response.json({
      ok: true,
      tokenMint: TOKEN_MINT,
      tokenMintSolscanUrl: `https://solscan.io/token/${TOKEN_MINT}`,
      bagsFeeShareUrl: BAGS_FEE_SHARE_URL,
      totalPayoutSol: formatSolAmount(totalPayoutSol),
      totalPayoutCount: claimEvents.length,
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
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message || 'Failed to read proof history',
    });
  }
}