export type DrawScheduleConfig = {
  enabled: boolean;
  timezone: string;
  firstDrawAt: string;
  initialIntervalHours: number;
  increaseEnabled: boolean;
  increaseHoursPerDraw: number;
  maxIntervalHours: number;
  minTokens: number;
};

export const drawScheduleConfig: DrawScheduleConfig = {
  enabled: true,
  timezone: 'America/Detroit',

  // ✅ REAL schedule (not forced past)
  firstDrawAt: '2026-03-21T20:00:00-04:00',

  initialIntervalHours: 24,
  increaseEnabled: false,
  increaseHoursPerDraw: 0,
  maxIntervalHours: 24,
  minTokens: 1000000,
};