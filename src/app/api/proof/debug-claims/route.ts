import { getAllWinnerClaimEvents } from '@/lib/bags-claim-events';

export async function GET() {
  try {
    const events = await getAllWinnerClaimEvents();

    return Response.json({
      ok: true,
      count: events.length,
      events: events.slice(0, 10),
    });
  } catch (err: any) {
    return Response.json({
      ok: false,
      error: err.message,
    });
  }
}