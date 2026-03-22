import { POST as runCycle } from '@/app/api/proof/run-cycle/route';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || '';

    if (!cronSecret) {
      return Response.json(
        {
          ok: false,
          error: 'Missing CRON_SECRET.',
        },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json(
        {
          ok: false,
          error: 'Unauthorized.',
        },
        { status: 401 }
      );
    }

    const cycleResponse = await runCycle(req);
    const cycleData = await cycleResponse.json();

    if (!cycleResponse.ok || !cycleData?.ok) {
      return Response.json(
        {
          ok: false,
          error: cycleData?.error || 'Run cycle failed.',
          cycleResponse: cycleData,
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      message: 'Scheduled cycle completed successfully.',
      cycleResponse: cycleData,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Scheduled cycle failed.',
      },
      { status: 500 }
    );
  }
}