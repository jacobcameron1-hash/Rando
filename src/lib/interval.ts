/**
 * Interval parsing and progressive timer logic.
 *
 * Supports shorthand notation: 30s, 20m, 12h, 13d, 2w
 * Formula: next_interval = min(base + (draw_count × increment), cap)
 */

const UNITS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse an interval string like "20m", "12h", "13d" into milliseconds.
 * Also accepts plain numbers (treated as milliseconds).
 */
export function parseInterval(input: string): number {
  const trimmed = input.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)?$/);
  if (!match) throw new Error(`Invalid interval format: "${input}"`);
  const value = parseFloat(match[1]);
  const unit = match[2] ?? 'ms';
  if (!(unit in UNITS)) throw new Error(`Unknown time unit: "${unit}"`);
  return Math.round(value * UNITS[unit]);
}

/**
 * Format milliseconds back to a human-readable shorthand string.
 * Always uses the largest applicable unit, with up to 1 decimal place.
 * e.g. 90m → "1.5h", 36h → "1.5d", 30m → "30m"
 */
export function formatInterval(ms: number): string {
  if (ms === 0) return '0s';

  const fmt = (val: number, unit: string) => {
    const rounded = Math.round(val * 10) / 10;
    return `${rounded % 1 === 0 ? rounded : rounded}${unit}`;
  };

  if (ms >= UNITS.d) return fmt(ms / UNITS.d, 'd');
  if (ms >= UNITS.h) return fmt(ms / UNITS.h, 'h');
  if (ms >= UNITS.m) return fmt(ms / UNITS.m, 'm');
  if (ms >= UNITS.s) return fmt(ms / UNITS.s, 's');
  return `${ms}ms`;
}

/**
 * Calculate the next interval duration given the progressive config.
 * draw_count is the number of draws completed so far (0-indexed).
 */
export function nextIntervalMs(
  base: number,
  increment: number,
  cap: number,
  drawCount: number,
): number {
  return Math.min(base + drawCount * increment, cap);
}

/**
 * Calculate what time the next draw should fire given config and current state.
 */
export function calcNextDrawTime(
  base: number,
  increment: number,
  cap: number,
  drawCount: number,
  fromDate: Date = new Date(),
): Date {
  const intervalMs = nextIntervalMs(base, increment, cap, drawCount);
  return new Date(fromDate.getTime() + intervalMs);
}
