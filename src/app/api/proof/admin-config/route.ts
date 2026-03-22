import { getDrawAdminConfig } from '@/lib/draw-admin-config';
import { getProofWinnerCycle } from '@/lib/proof-winner-cycle';

export async function GET() {
  try {
    console.log('[admin-config route] GET called');

    const config = await getDrawAdminConfig();
    const winnerCycle = await getProofWinnerCycle();

    console.log('[admin-config route] success:', {
      config,
      winnerCycle,
    });

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