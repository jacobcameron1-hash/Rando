import { readProofHistory } from '@/lib/proof-history';

export async function GET() {
  try {
    const history = await readProofHistory();

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
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message || 'Failed to read draw history',
    });
  }
}