import { POST as runDraw } from '@/app/api/proof/run-draw/route';

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

    let requestToUse = request;

    if (isCron && RANDO_ADMIN_API_KEY) {
      const headers = new Headers(request.headers);
      headers.delete('authorization');
      headers.set('x-rando-admin-key', RANDO_ADMIN_API_KEY);

      requestToUse = new Request(request, { headers });
    }

    const response = await runDraw(requestToUse);
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