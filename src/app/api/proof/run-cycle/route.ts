async function runCycle(request: Request) {
  try {
    const origin = new URL(request.url).origin;

    const drawRes = await fetch(`${origin}/api/proof/run-draw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const drawData = await drawRes.json();

    if (!drawRes.ok || !drawData?.ok) {
      return Response.json(
        {
          ok: false,
          step: 'run-draw',
          error: drawData?.error || 'Draw failed',
          drawResponse: drawData,
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      step: 'cycle-complete',
      message: 'Draw ran successfully.',
      drawResponse: drawData,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Run cycle failed',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return runCycle(request);
}

export async function GET(request: Request) {
  return runCycle(request);
}