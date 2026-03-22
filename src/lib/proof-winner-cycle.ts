import { db } from '@/db';
import { sql } from 'drizzle-orm';

export type ProofWinnerCycleRecord = {
  id: string;
  tokenMint: string;
  activeWinnerWallet: string | null;
  cycleStartedAt: string | null;
  cycleCompletedAt: string | null;
  status: string;
  minPayoutSol: number;
  accumulatedSol: number;
  targetReached: boolean;
  lastDrawId: string | null;
  lastDisqualifiedWinnerWallet: string | null;
  lastDisqualifiedWinnerAmount: number;
  lastDisqualifiedAt: string | null;
  lastDisqualificationReason: string | null;
  lastUpdatedAt: string | null;
};

const DEFAULT_ID = 'global';
const DEFAULT_TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';

let tableReady = false;

function asIsoString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return null;
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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

async function ensureProofWinnerCycleTableExists() {
  if (tableReady) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS proof_winner_cycle (
      id text PRIMARY KEY,
      token_mint text NOT NULL,
      active_winner_wallet text,
      cycle_started_at timestamptz,
      cycle_completed_at timestamptz,
      status text NOT NULL DEFAULT 'idle',
      min_payout_sol numeric(18, 9) NOT NULL DEFAULT 0.05,
      accumulated_sol numeric(18, 9) NOT NULL DEFAULT 0,
      target_reached boolean NOT NULL DEFAULT false,
      last_draw_id text,
      last_disqualified_winner_wallet text,
      last_disqualified_winner_amount numeric(18, 9) NOT NULL DEFAULT 0,
      last_disqualified_at timestamptz,
      last_disqualification_reason text,
      last_updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_disqualified_winner_wallet text
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_disqualified_winner_amount numeric(18, 9) NOT NULL DEFAULT 0
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_disqualified_at timestamptz
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_disqualification_reason text
  `);

  tableReady = true;
}

function mapRow(row: Record<string, unknown>): ProofWinnerCycleRecord {
  return {
    id: asString(row.id, DEFAULT_ID),
    tokenMint: asString(row.token_mint, DEFAULT_TOKEN_MINT),
    activeWinnerWallet:
      typeof row.active_winner_wallet === 'string'
        ? row.active_winner_wallet
        : null,
    cycleStartedAt: asIsoString(row.cycle_started_at),
    cycleCompletedAt: asIsoString(row.cycle_completed_at),
    status: asString(row.status, 'idle'),
    minPayoutSol: asNumber(row.min_payout_sol, 0.05),
    accumulatedSol: asNumber(row.accumulated_sol, 0),
    targetReached: asBoolean(row.target_reached, false),
    lastDrawId: typeof row.last_draw_id === 'string' ? row.last_draw_id : null,
    lastDisqualifiedWinnerWallet:
      typeof row.last_disqualified_winner_wallet === 'string'
        ? row.last_disqualified_winner_wallet
        : null,
    lastDisqualifiedWinnerAmount: asNumber(
      row.last_disqualified_winner_amount,
      0
    ),
    lastDisqualifiedAt: asIsoString(row.last_disqualified_at),
    lastDisqualificationReason:
      typeof row.last_disqualification_reason === 'string'
        ? row.last_disqualification_reason
        : null,
    lastUpdatedAt: asIsoString(row.last_updated_at),
  };
}

export async function getProofWinnerCycle(): Promise<ProofWinnerCycleRecord> {
  await ensureProofWinnerCycleTableExists();

  const result = await db.execute(sql`
    SELECT
      id,
      token_mint,
      active_winner_wallet,
      cycle_started_at,
      cycle_completed_at,
      status,
      min_payout_sol,
      accumulated_sol,
      target_reached,
      last_draw_id,
      last_disqualified_winner_wallet,
      last_disqualified_winner_amount,
      last_disqualified_at,
      last_disqualification_reason,
      last_updated_at
    FROM proof_winner_cycle
    WHERE id = ${DEFAULT_ID}
    LIMIT 1
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;

  if (row) {
    return mapRow(row);
  }

  const defaultRecord: ProofWinnerCycleRecord = {
    id: DEFAULT_ID,
    tokenMint: DEFAULT_TOKEN_MINT,
    activeWinnerWallet: null,
    cycleStartedAt: null,
    cycleCompletedAt: null,
    status: 'idle',
    minPayoutSol: 0.05,
    accumulatedSol: 0,
    targetReached: false,
    lastDrawId: null,
    lastDisqualifiedWinnerWallet: null,
    lastDisqualifiedWinnerAmount: 0,
    lastDisqualifiedAt: null,
    lastDisqualificationReason: null,
    lastUpdatedAt: new Date().toISOString(),
  };

  await db.execute(sql`
    INSERT INTO proof_winner_cycle (
      id,
      token_mint,
      active_winner_wallet,
      cycle_started_at,
      cycle_completed_at,
      status,
      min_payout_sol,
      accumulated_sol,
      target_reached,
      last_draw_id,
      last_disqualified_winner_wallet,
      last_disqualified_winner_amount,
      last_disqualified_at,
      last_disqualification_reason,
      last_updated_at
    )
    VALUES (
      ${defaultRecord.id},
      ${defaultRecord.tokenMint},
      ${defaultRecord.activeWinnerWallet},
      ${defaultRecord.cycleStartedAt},
      ${defaultRecord.cycleCompletedAt},
      ${defaultRecord.status},
      ${String(defaultRecord.minPayoutSol)},
      ${String(defaultRecord.accumulatedSol)},
      ${defaultRecord.targetReached},
      ${defaultRecord.lastDrawId},
      ${defaultRecord.lastDisqualifiedWinnerWallet},
      ${String(defaultRecord.lastDisqualifiedWinnerAmount)},
      ${defaultRecord.lastDisqualifiedAt},
      ${defaultRecord.lastDisqualificationReason},
      ${defaultRecord.lastUpdatedAt}
    )
    ON CONFLICT (id) DO NOTHING
  `);

  return defaultRecord;
}

export async function setProofWinnerCycle(
  updates: Partial<ProofWinnerCycleRecord>
): Promise<ProofWinnerCycleRecord> {
  await ensureProofWinnerCycleTableExists();

  const current = await getProofWinnerCycle();

  const next: ProofWinnerCycleRecord = {
    ...current,
    ...updates,
    id: DEFAULT_ID,
    tokenMint: updates.tokenMint ?? current.tokenMint ?? DEFAULT_TOKEN_MINT,
    lastUpdatedAt: new Date().toISOString(),
  };

  await db.execute(sql`
    INSERT INTO proof_winner_cycle (
      id,
      token_mint,
      active_winner_wallet,
      cycle_started_at,
      cycle_completed_at,
      status,
      min_payout_sol,
      accumulated_sol,
      target_reached,
      last_draw_id,
      last_disqualified_winner_wallet,
      last_disqualified_winner_amount,
      last_disqualified_at,
      last_disqualification_reason,
      last_updated_at
    )
    VALUES (
      ${next.id},
      ${next.tokenMint},
      ${next.activeWinnerWallet},
      ${next.cycleStartedAt},
      ${next.cycleCompletedAt},
      ${next.status},
      ${String(next.minPayoutSol)},
      ${String(next.accumulatedSol)},
      ${next.targetReached},
      ${next.lastDrawId},
      ${next.lastDisqualifiedWinnerWallet},
      ${String(next.lastDisqualifiedWinnerAmount)},
      ${next.lastDisqualifiedAt},
      ${next.lastDisqualificationReason},
      ${next.lastUpdatedAt}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      token_mint = EXCLUDED.token_mint,
      active_winner_wallet = EXCLUDED.active_winner_wallet,
      cycle_started_at = EXCLUDED.cycle_started_at,
      cycle_completed_at = EXCLUDED.cycle_completed_at,
      status = EXCLUDED.status,
      min_payout_sol = EXCLUDED.min_payout_sol,
      accumulated_sol = EXCLUDED.accumulated_sol,
      target_reached = EXCLUDED.target_reached,
      last_draw_id = EXCLUDED.last_draw_id,
      last_disqualified_winner_wallet = EXCLUDED.last_disqualified_winner_wallet,
      last_disqualified_winner_amount = EXCLUDED.last_disqualified_winner_amount,
      last_disqualified_at = EXCLUDED.last_disqualified_at,
      last_disqualification_reason = EXCLUDED.last_disqualification_reason,
      last_updated_at = EXCLUDED.last_updated_at
  `);

  return next;
}

export async function resetProofWinnerCycle(
  minPayoutSol = 0.05
): Promise<ProofWinnerCycleRecord> {
  return setProofWinnerCycle({
    activeWinnerWallet: null,
    cycleStartedAt: null,
    cycleCompletedAt: null,
    status: 'idle',
    minPayoutSol,
    accumulatedSol: 0,
    targetReached: false,
    lastDrawId: null,
    lastDisqualifiedWinnerWallet: null,
    lastDisqualifiedWinnerAmount: 0,
    lastDisqualifiedAt: null,
    lastDisqualificationReason: null,
  });
}