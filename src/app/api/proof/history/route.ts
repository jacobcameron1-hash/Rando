import { readProofHistory } from '@/lib/proof-history';
import { getRecentProofWinnerDisqualifications } from '@/lib/proof-winner-cycle';

function formatUiAmount(value: number) {
  return Number(value.toFixed(6));
}

function formatSolAmount(value: number) {
  return Number(value.toFixed(9));
}

export async function GET() {
  try {
    const history = await readProofHistory();
    const disqualifications = await getRecentProofWinnerDisqualifications(3);

    const latestThree = history.slice(0, 3).map((item) => ({
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
        claimableSolAtCheck: formatSolAmount(
          item.claimableSolAtCheck
        ),
        createdAt: item.createdAt,
      })),
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message || 'Failed to read proof history',
    });
  }
}