import { NextResponse } from 'next/server';
import { getDrawScheduleState } from '@/lib/draw-schedule-utils';

export async function GET() {
  try {
    const schedule = getDrawScheduleState();

    return NextResponse.json({
      ok: true,
      schedule: {
        enabled: schedule.enabled,
        timezone: schedule.timezone,
        nowIso: schedule.nowIso,
        firstDrawAtIso: schedule.firstDrawAtIso,
        drawIndex: schedule.drawIndex,
        currentIntervalHours: schedule.currentIntervalHours,
        previousDrawAtIso: schedule.previousDrawAtIso,
        nextDrawAtIso: schedule.nextDrawAtIso,
        countdownMs: schedule.countdownMs,
      },
    });
  } catch (error) {
    console.error('GET /api/proof/next-draw error', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load next draw schedule',
      },
      { status: 500 }
    );
  }
}