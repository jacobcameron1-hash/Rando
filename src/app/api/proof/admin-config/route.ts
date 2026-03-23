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
    const config = await getDrawAdminConfig();
    const winnerCycle = await getProofWinnerCycle();

    const isAdmin = isAuthorizedRequest(request);

    if (isAdmin) {
      return Response.json({
        ok: true,
        config,
        winnerCycle,
      });
    }

    return Response.json({
      ok: true,
      config: {
        initialIntervalHours: config.initialIntervalHours,
        minPayoutSol: config.minPayoutSol,
        minTokens: config.minTokens,
      },
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