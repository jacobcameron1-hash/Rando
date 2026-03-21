import { POST as runDraw } from '@/app/api/proof/run-draw/route';

async function runCycle(request: Request) {
  try {
    const response = await runDraw(request);
    const drawData = await response.json();

    if (!drawData?.ok) {
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