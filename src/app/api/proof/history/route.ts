import { readProofHistory } from '@/lib/proof-history';
import {
  getProofWinnerCycle,
  getRecentProofWinnerDisqualifications,
} from '@/lib/proof-winner-cycle';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function formatSolAmount(value: number) {
  return Number(value.toFixed(9));
}

export async function GET() {
  try {
    const [history, disqualifications, winnerCycle, config] = await Promise.all([
      readProofHistory(),
      getRecentProofWinnerDisqualifications(3),
      getProofWinnerCycle(),
      getDrawAdminConfig(),
    ]);

    // ✅ ONLY show real winner events
    const realWinnerHistory = history.filter(
      (item) => item.isWinnerEvent !== false
    );

    const latestThree = realWinnerHistory.slice(0, 3).map((item) => ({
      drawId: item.drawId,
      snapshotAt: item.snapshotAt,
      tokenMint: item.tokenMint,
      winner: item.winner,
      counts: item.counts,
    }));

    return Response.json({
      ok: true,
      history: latestThree,
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
        lastDisqualifiedWinnerWallet: winnerCycle.lastDisqualifiedWinnerWallet,
        lastDisqualifiedWinnerAmount: formatUiAmount(
          winnerCycle.lastDisqualifiedWinnerAmount
        ),
        lastDisqualifiedAt: winnerCycle.lastDisqualifiedAt,
        lastDisqualificationReason: winnerCycle.lastDisqualificationReason,
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