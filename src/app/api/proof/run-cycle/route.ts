const CRON_SECRET = process.env.CRON_SECRET || '';
const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY || '';
const VERCEL_AUTOMATION_BYPASS_SECRET =
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

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

    const headers: Record<string, string> = {
      'x-rando-admin-key': RANDO_ADMIN_API_KEY,
    };

    if (VERCEL_AUTOMATION_BYPASS_SECRET) {
      headers['x-vercel-protection-bypass'] =
        VERCEL_AUTOMATION_BYPASS_SECRET;
    }

    const response = await fetch(runDrawUrl, {
      method: 'POST',
      headers,
      cache: 'no-store',
    });

    const responseText = await response.text();
    console.log('[RUN-CYCLE] Fetch response status:', response.status);
    console.log(
      '[RUN-CYCLE] Fetch response first 200 chars:',
      responseText.substring(0, 200)
    );

    let drawData;
    try {
      drawData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[RUN-CYCLE] Failed to parse JSON response:', parseError);
      throw new Error(
        `run-draw returned non-JSON (status ${response.status}): ${responseText.substring(0, 500)}`
      );
    }

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