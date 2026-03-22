import { getDrawScheduleState } from './draw-schedule-utils';

export type DrawSlotState = {
  slotId: string;
  drawIndex: number;
  nextDrawAtIso: string;
  previousDrawAtIso: string | null;
  currentIntervalHours: number;
  isDue: boolean;
};

function toSafeSlotPart(value: string) {
  return value.replace(/[:.]/g, '-');
}

// Allow small timing drift (in milliseconds)
const DRAW_DUE_GRACE_MS = 60 * 1000; // 60 seconds

export function getCurrentDrawSlot(now = new Date()): DrawSlotState {
  const schedule = getDrawScheduleState(now);
  const nextDrawAt = new Date(schedule.nextDrawAtIso);
  const nextDrawAtMs = nextDrawAt.getTime();
  const nowMs = now.getTime();

  if (Number.isNaN(nextDrawAtMs)) {
    throw new Error('Invalid schedule.nextDrawAtIso');
  }

  return {
    slotId: `draw-${schedule.drawIndex}-${toSafeSlotPart(
      schedule.nextDrawAtIso
    )}`,
    drawIndex: schedule.drawIndex,
    nextDrawAtIso: schedule.nextDrawAtIso,
    previousDrawAtIso: schedule.previousDrawAtIso,
    currentIntervalHours: schedule.currentIntervalHours,

    // Key fix: allow small buffer so cron timing doesn't miss the draw
    isDue: nowMs >= nextDrawAtMs - DRAW_DUE_GRACE_MS,
  };
}