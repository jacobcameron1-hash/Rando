import { NextResponse } from 'next/server';
import { getDrawScheduleStateFromAdminConfig } from '@/lib/draw-schedule-utils';

export async function GET() {
  try {
    const schedule = await getDrawScheduleStateFromAdminConfig();

    return NextResponse.json(
      {
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
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  } catch (error) {
    console.error('GET /api/proof/next-draw error', error);

    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to load next draw schedule',
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}