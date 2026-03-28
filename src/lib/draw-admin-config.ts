import { db } from '@/db';
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
  minPayoutSol: number;
  excludedWallets: string[];
};

const DEFAULT_ID = 'global';

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function asIsoString(value: unknown, fallback = ''): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : fallback;
}

function normalizeExcludedWallets(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

let configTableReady = false;

async function ensureDrawAdminConfigTableExists() {
  if (configTableReady) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draw_admin_config (
      id text PRIMARY KEY,
      enabled boolean NOT NULL DEFAULT true,
      timezone text NOT NULL,
      first_draw_at timestamptz NOT NULL,
      initial_interval_hours integer NOT NULL,
      increase_enabled boolean NOT NULL DEFAULT false,
      increase_hours_per_draw integer NOT NULL DEFAULT 0,
      max_interval_hours integer NOT NULL,
      min_tokens integer NOT NULL,
      min_payout_sol numeric(18, 9) NOT NULL DEFAULT 0.01,
      excluded_wallets jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    ALTER TABLE draw_admin_config
    ADD COLUMN IF NOT EXISTS min_payout_sol numeric(18, 9) NOT NULL DEFAULT 0.01
  `);

  configTableReady = true;
}

export async function getDrawAdminConfig(): Promise<DrawAdminConfigRecord> {
  await ensureDrawAdminConfigTableExists();

  const result = await db.execute(sql`
    SELECT
      enabled,
      timezone,
      first_draw_at,
      initial_interval_hours,
      increase_enabled,
      increase_hours_per_draw,
      max_interval_hours,
      min_tokens,
      min_payout_sol,
      excluded_wallets
    FROM draw_admin_config
    WHERE id = ${DEFAULT_ID}
    LIMIT 1
  `);

  const row = (result.rows[0] ?? null) as Record<string, unknown> | null;

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
      minPayoutSol: 0.01,
      excludedWallets: [
        '4FMEhKstf4AnZi6bdnVb5wvcffWPCebsvthvkPYTzC99',
        'BJz5RFx9ycWZ9dVbRtsZq7h3L6XPWVDuDtbgEeJVBJMG',
      ],
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
        min_payout_sol,
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
        ${String(defaultConfig.minPayoutSol)},
        ${JSON.stringify(defaultConfig.excludedWallets)}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
    `);

    return defaultConfig;
  }

  return {
    enabled: asBoolean(row.enabled),
    timezone: asString(row.timezone),
    firstDrawAt: asIsoString(row.first_draw_at),
    initialIntervalHours: asNumber(row.initial_interval_hours),
    increaseEnabled: asBoolean(row.increase_enabled),
    increaseHoursPerDraw: asNumber(row.increase_hours_per_draw),
    maxIntervalHours: asNumber(row.max_interval_hours),
    minTokens: asNumber(row.min_tokens),
    minPayoutSol: asNumber(row.min_payout_sol, 0.01),
    excludedWallets: normalizeExcludedWallets(row.excluded_wallets),
  };
}