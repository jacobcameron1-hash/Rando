import { drawScheduleConfig } from './draw-schedule';
import { getDrawAdminConfig } from './draw-admin-config';

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

export type DrawScheduleConfigShape = {
  enabled: boolean;
  timezone: string;
  firstDrawAt: string;
  initialIntervalHours: number;
  increaseEnabled: boolean;
  increaseHoursPerDraw: number;
  maxIntervalHours: number;
  minTokens: number;
};

function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

function clampIntervalHours(
  hours: number,
  config: DrawScheduleConfigShape
): number {
  const minHours = config.initialIntervalHours;
  const maxHours = config.maxIntervalHours;

  if (hours < minHours) return minHours;
  if (hours > maxHours) return maxHours;

  return hours;
}

function getIntervalHoursForDraw(
  drawIndex: number,
  config: DrawScheduleConfigShape
): number {
  const baseHours = config.initialIntervalHours;

  if (!config.increaseEnabled) {
    return clampIntervalHours(baseHours, config);
  }

  const increasedHours = baseHours + config.increaseHoursPerDraw * drawIndex;

  return clampIntervalHours(increasedHours, config);
}

function getNextDrawAtFromAnchor(
  nowMs: number,
  firstDrawAtMs: number,
  config: DrawScheduleConfigShape
) {
  if (nowMs < firstDrawAtMs) {
    return {
      drawIndex: 0,
      previousDrawAtMs: null,
      nextDrawAtMs: firstDrawAtMs,
      currentIntervalHours: getIntervalHoursForDraw(0, config),
    };
  }

  let drawIndex = 0;
  let previousDrawAtMs = firstDrawAtMs;
  let currentIntervalHours = getIntervalHoursForDraw(drawIndex, config);
  let nextDrawAtMs = firstDrawAtMs + hoursToMs(currentIntervalHours);

  while (nowMs >= nextDrawAtMs) {
    drawIndex += 1;
    previousDrawAtMs = nextDrawAtMs;
    currentIntervalHours = getIntervalHoursForDraw(drawIndex, config);
    nextDrawAtMs = previousDrawAtMs + hoursToMs(currentIntervalHours);
  }

  return {
    drawIndex,
    previousDrawAtMs,
    nextDrawAtMs,
    currentIntervalHours,
  };
}

function buildDrawScheduleState(
  config: DrawScheduleConfigShape,
  now = new Date()
): DrawScheduleState {
  const nowMs = now.getTime();
  const firstDrawAt = new Date(config.firstDrawAt);
  const firstDrawAtMs = firstDrawAt.getTime();

  if (Number.isNaN(firstDrawAtMs)) {
    throw new Error('Invalid draw schedule firstDrawAt');
  }

  if (!config.enabled) {
    return {
      enabled: false,
      timezone: config.timezone,
      nowIso: now.toISOString(),
      firstDrawAtIso: firstDrawAt.toISOString(),
      drawIndex: 0,
      currentIntervalHours: config.initialIntervalHours,
      previousDrawAtIso: null,
      nextDrawAtIso: firstDrawAt.toISOString(),
      countdownMs: Math.max(firstDrawAtMs - nowMs, 0),
    };
  }

  const schedule = getNextDrawAtFromAnchor(nowMs, firstDrawAtMs, config);

  return {
    enabled: true,
    timezone: config.timezone,
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

export function getDrawScheduleState(now = new Date()): DrawScheduleState {
  return buildDrawScheduleState(drawScheduleConfig, now);
}

export async function getDrawScheduleStateFromAdminConfig(
  now = new Date()
): Promise<DrawScheduleState> {
  const config = await getDrawAdminConfig();

  return buildDrawScheduleState(config, now);
}