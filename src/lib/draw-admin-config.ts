import { db } from '@/db';
import { drawAdminConfig } from '@/db/schema';
import { sql } from 'drizzle-orm';

export type DrawAdminConfigRecord = {
  enabled: boolean;
  timezone: string;
  firstDrawAt: string;
  initialIntervalHours: number;
  increaseEnabled: boolean;
  increaseHoursPerDraw: number;
  maxIntervalHours: number;
  minTokens: number;
  excludedWallets: string[];
};

const DEFAULT_ID = 'global';

export async function getDrawAdminConfig(): Promise<DrawAdminConfigRecord> {
  const result = await db.execute(sql`
    SELECT *
    FROM draw_admin_config
    WHERE id = ${DEFAULT_ID}
    LIMIT 1
  `);

  const row = result.rows[0];

  // If no config exists yet → create one from current defaults
  if (!row) {
    const defaultConfig: DrawAdminConfigRecord = {
      enabled: true,
      timezone: 'America/Detroit',
      firstDrawAt: '2026-03-20T20:00:00-04:00',
      initialIntervalHours: 24,
      increaseEnabled: false,
      increaseHoursPerDraw: 0,
      maxIntervalHours: 24,
      minTokens: 1000000,
      excludedWallets: [],
    };

    await db.execute(sql`
      INSERT INTO draw_admin_config (
        id,
        enabled,
        timezone,
        first_draw_at,
        initial_interval_hours,
        increase_enabled,
        increase_hours_per_draw,
        max_interval_hours,
        min_tokens,
        excluded_wallets
      )
      VALUES (
        ${DEFAULT_ID},
        ${defaultConfig.enabled},
        ${defaultConfig.timezone},
        ${defaultConfig.firstDrawAt},
        ${defaultConfig.initialIntervalHours},
        ${defaultConfig.increaseEnabled},
        ${defaultConfig.increaseHoursPerDraw},
        ${defaultConfig.maxIntervalHours},
        ${defaultConfig.minTokens},
        ${JSON.stringify(defaultConfig.excludedWallets)}::jsonb
      )
    `);

    return defaultConfig;
  }

  return {
    enabled: row.enabled,
    timezone: row.timezone,
    firstDrawAt:
      row.first_draw_at instanceof Date
        ? row.first_draw_at.toISOString()
        : row.first_draw_at,
    initialIntervalHours: row.initial_interval_hours,
    increaseEnabled: row.increase_enabled,
    increaseHoursPerDraw: row.increase_hours_per_draw,
    maxIntervalHours: row.max_interval_hours,
    minTokens: row.min_tokens,
    excludedWallets: row.excluded_wallets || [],
  };
}