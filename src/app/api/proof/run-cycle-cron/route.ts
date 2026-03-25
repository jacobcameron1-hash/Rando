import { POST as runCycle } from '@/app/api/proof/run-cycle/route';

export async function GET(req: Request) {
  try {
    console.log('[CRON HIT]', new Date().toISOString());

    const cycleResponse = await runCycle(req);
    const cycleData = await cycleResponse.json();

    console.log('[CRON RESULT]', cycleData);

    return Response.json({
      ok: true,
      debug: true,
      cycleResponse: cycleData,
    });
  } catch (error: any) {
    console.error('[CRON ERROR]', error);

    return Response.json(
      {
        ok: false,
        error: error?.message || 'Scheduled cycle failed.',
      },
      { status: 500 }
    );
  }
}