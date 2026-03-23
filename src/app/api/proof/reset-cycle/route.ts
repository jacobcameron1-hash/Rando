import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import { resetProofWinnerCycle, withProofWinnerCycleLock } from '@/lib/proof-winner-cycle';

const RANDO_ADMIN_API_KEY = process.env.RANDO_ADMIN_API_KEY!;

function isAuthorizedRequest(request: Request) {
  const headerValue = request.headers.get('x-rando-admin-key');

  if (!RANDO_ADMIN_API_KEY) {
    throw new Error('Missing RANDO_ADMIN_API_KEY environment variable');
  }

  return headerValue === RANDO_ADMIN_API_KEY;
}

export async function POST(request: Request) {
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

    return await withProofWinnerCycleLock(async () => {
      const config = await getDrawAdminConfig();
      const winnerCycle = await resetProofWinnerCycle(config.minPayoutSol);

      return Response.json({
        ok: true,
        message: 'Proof winner cycle reset successfully.',
        winnerCycle,
      });
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || 'Failed to reset proof winner cycle',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json(
    {
      ok: false,
      error: 'Method not allowed. Use POST for /api/proof/reset-cycle.',
    },
    { status: 405 }
  );
}