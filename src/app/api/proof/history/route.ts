import { readProofHistory } from '@/lib/proof-history';
import {
  getProofWinnerCycle,
  getRecentProofWinnerDisqualifications,
} from '@/lib/proof-winner-cycle';
import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import {
  getAllWinnerClaimEvents,
  findClaimForCycle,
} from '@/lib/bags-claim-events';

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
    const [history, disqualifications, winnerCycle, config, claimEvents] =
      await Promise.all([
        readProofHistory(),
        getRecentProofWinnerDisqualifications(3),
        getProofWinnerCycle(),
        getDrawAdminConfig(),
        getAllWinnerClaimEvents(),
      ]);

    const realWinnerHistory = history.filter(
      (item) => item.isWinnerEvent !== false
    );

    const getEventTimestampMs = (timestamp: string | number): number => {
      if (typeof timestamp === 'number') return timestamp * 1000;

      const numeric = Number(timestamp);
      if (Number.isFinite(numeric) && /^\d+$/.test(timestamp)) {
        return numeric * 1000;
      }

      return new Date(timestamp).getTime();
    };

    const drawHistoryWallets = new Set(
      realWinnerHistory.map((item) => item.winner?.owner).filter(Boolean)
    );

    const earliestDrawAt =
      realWinnerHistory.length > 0
        ? new Date(
            realWinnerHistory[realWinnerHistory.length - 1].snapshotAt
          ).getTime()
        : 0;

    const scopedClaimEvents = claimEvents.filter((e) => {
      if (!drawHistoryWallets.has(e.wallet)) return false;

      const ts = getEventTimestampMs(e.timestamp);
      return Number.isFinite(ts) && ts >= earliestDrawAt - 24 * 60 * 60 * 1000;
    });

    const totalPayoutSol = scopedClaimEvents.reduce(
      (sum, e) => sum + e.amountSol,
      0
    );
    const totalPayoutCount = scopedClaimEvents.length;

    const latestTen = realWinnerHistory.slice(0, 10).map((item) => {
      const claim = findClaimForCycle(
        scopedClaimEvents,
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