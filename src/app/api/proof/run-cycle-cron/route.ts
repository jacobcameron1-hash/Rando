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

    const origin = new URL(req.url).origin;

    const cycleRes = await fetch(`${origin}/api/proof/run-cycle`, {
      method: 'POST',
      cache: 'no-store',
    });

    const cycleData = await cycleRes.json();

    if (!cycleRes.ok || !cycleData?.ok) {
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
