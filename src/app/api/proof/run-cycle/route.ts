const CRON_SECRET = process.env.CRON_SECRET || '';
const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY || '';

function isVercelCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization') || '';
  if (!CRON_SECRET) {
    return false;
  }
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function isAdminRequest(request: Request): boolean {
  if (!RANDO_ADMIN_API_KEY) return false;
  const adminKey = request.headers.get('x-rando-admin-key') || '';
  return adminKey === RANDO_ADMIN_API_KEY;
}

async function runCycle(request: Request) {
  try {
    const isCron = isVercelCronRequest(request);
    const isAdmin = isAdminRequest(request);

    if (!isCron && !isAdmin) {
      return Response.json(
        {
          ok: false,
          error: 'Unauthorized. Valid CRON_SECRET or x-rando-admin-key required.',
        },
        { status: 401 }
      );
    }

    const runDrawUrl = new URL('/api/proof/run-draw', request.url).toString();

    const response = await fetch(runDrawUrl, {
      method: 'POST',
      headers: {
        'x-rando-admin-key': RANDO_ADMIN_API_KEY,
      },
      cache: 'no-store',
    });

    const drawData = await response.json();

    const alreadyProcessed =
      drawData?.error === 'This scheduled draw slot has already been processed';

    if (alreadyProcessed) {
      return Response.json({
        ok: true,
        step: 'already-processed',
        message: 'This scheduled draw slot was already processed.',
        drawResponse: drawData,
      });
    }

    if (!response.ok || !drawData?.ok) {
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