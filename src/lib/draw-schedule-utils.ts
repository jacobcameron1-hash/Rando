import { drawScheduleConfig } from './draw-schedule';

export type DrawScheduleState = {
  enabled: boolean;
  timezone: string;
  nowIso: string;
  firstDrawAtIso: string;
  drawIndex: number;
  currentIntervalHours: number;
  previousDrawAtIso: string | null;
  nextDrawAtIso: string;
  countdownMs: number;
};

function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

function clampIntervalHours(hours: number): number {
  const minHours = drawScheduleConfig.initialIntervalHours;
  const maxHours = drawScheduleConfig.maxIntervalHours;

  if (hours < minHours) {
    return minHours;
  }

  if (hours > maxHours) {
    return maxHours;
  }

  return hours;
}

function getIntervalHoursForDraw(drawIndex: number): number {
  const baseHours = drawScheduleConfig.initialIntervalHours;

  if (!drawScheduleConfig.increaseEnabled) {
    return clampIntervalHours(baseHours);
  }

  const increasedHours =
    baseHours + drawScheduleConfig.increaseHoursPerDraw * drawIndex;

  return clampIntervalHours(increasedHours);
}

function getNextDrawAtFromAnchor(nowMs: number, firstDrawAtMs: number): {
  drawIndex: number;
  previousDrawAtMs: number | null;
  nextDrawAtMs: number;
  currentIntervalHours: number;
} {
  if (nowMs < firstDrawAtMs) {
    return {
      drawIndex: 0,
      previousDrawAtMs: null,
      nextDrawAtMs: firstDrawAtMs,
      currentIntervalHours: getIntervalHoursForDraw(0),
    };
  }

  let drawIndex = 0;
  let previousDrawAtMs = firstDrawAtMs;
  let currentIntervalHours = getIntervalHoursForDraw(drawIndex);
  let nextDrawAtMs = firstDrawAtMs + hoursToMs(currentIntervalHours);

  while (nowMs >= nextDrawAtMs) {
    drawIndex += 1;
    previousDrawAtMs = nextDrawAtMs;
    currentIntervalHours = getIntervalHoursForDraw(drawIndex);
    nextDrawAtMs = previousDrawAtMs + hoursToMs(currentIntervalHours);
  }

  return {
    drawIndex,
    previousDrawAtMs,
    nextDrawAtMs,
    currentIntervalHours,
  };
}

export function getDrawScheduleState(now = new Date()): DrawScheduleState {
  const nowMs = now.getTime();
  const firstDrawAt = new Date(drawScheduleConfig.firstDrawAt);
  const firstDrawAtMs = firstDrawAt.getTime();

  if (Number.isNaN(firstDrawAtMs)) {
    throw new Error('Invalid drawScheduleConfig.firstDrawAt');
  }

  if (!drawScheduleConfig.enabled) {
    return {
      enabled: false,
      timezone: drawScheduleConfig.timezone,
      nowIso: now.toISOString(),
      firstDrawAtIso: firstDrawAt.toISOString(),
      drawIndex: 0,
      currentIntervalHours: drawScheduleConfig.initialIntervalHours,
      previousDrawAtIso: null,
      nextDrawAtIso: firstDrawAt.toISOString(),
      countdownMs: Math.max(firstDrawAtMs - nowMs, 0),
    };
  }

  const schedule = getNextDrawAtFromAnchor(nowMs, firstDrawAtMs);

  return {
    enabled: true,
    timezone: drawScheduleConfig.timezone,
    nowIso: now.toISOString(),
    firstDrawAtIso: firstDrawAt.toISOString(),
    drawIndex: schedule.drawIndex,
    currentIntervalHours: schedule.currentIntervalHours,
    previousDrawAtIso:
      schedule.previousDrawAtMs === null
        ? null
        : new Date(schedule.previousDrawAtMs).toISOString(),
    nextDrawAtIso: new Date(schedule.nextDrawAtMs).toISOString(),
    countdownMs: Math.max(schedule.nextDrawAtMs - nowMs, 0),
  };
}