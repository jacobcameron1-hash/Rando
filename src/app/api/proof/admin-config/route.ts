import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import { getProofWinnerCycle } from '@/lib/proof-winner-cycle';

const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY!;

function isAuthorizedRequest(request: Request) {
  const headerValue = request.headers.get('x-rando-admin-key');

  if (!RANDO_ADMIN_API_KEY) {
    throw new Error('Missing RANDO_ADMIN_API_KEY environment variable');
  }

  return headerValue === RANDO_ADMIN_API_KEY;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorizedRequest(request)) {
      return Response.json(
        {
          ok: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    const config = await getDrawAdminConfig();
    const winnerCycle = await getProofWinnerCycle();

    return Response.json({
      ok: true,
      config,
      winnerCycle,
    });
  } catch (error) {
    console.error('[admin-config route] GET failed:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return Response.json(
      {
        ok: false,
        error: 'Failed to load admin config',
      },
      { status: 500 }
    );
  }
}