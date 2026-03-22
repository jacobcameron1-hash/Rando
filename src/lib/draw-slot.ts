import { getDrawScheduleState } from './draw-schedule-utils';

export type DrawSlotState = {
  slotId: string;
  drawIndex: number;
  scheduledDrawAtIso: string;
  nextDrawAtIso: string;
  previousDrawAtIso: string | null;
  currentIntervalHours: number;
  isDue: boolean;
};

function toSafeSlotPart(value: string) {
  return value.replace(/[:.]/g, '-');
}

const DRAW_DUE_GRACE_MS = 60 * 1000;

export function getCurrentDrawSlot(now = new Date()): DrawSlotState {
  const schedule = getDrawScheduleState(now);
  const nowMs = now.getTime();

  const scheduledDrawAtIso =
    schedule.previousDrawAtIso ?? schedule.nextDrawAtIso;

  const scheduledDrawAt = new Date(scheduledDrawAtIso);
  const scheduledDrawAtMs = scheduledDrawAt.getTime();

  if (Number.isNaN(scheduledDrawAtMs)) {
    throw new Error('Invalid scheduled draw time');
  }

  const isDue =
    schedule.previousDrawAtIso !== null &&
    nowMs >= scheduledDrawAtMs - DRAW_DUE_GRACE_MS;

  return {
    slotId: `draw-${schedule.drawIndex}-${toSafeSlotPart(scheduledDrawAtIso)}`,
    drawIndex: schedule.drawIndex,
    scheduledDrawAtIso,
    nextDrawAtIso: schedule.nextDrawAtIso,
    previousDrawAtIso: schedule.previousDrawAtIso,
    currentIntervalHours: schedule.currentIntervalHours,
    isDue,
  };
}