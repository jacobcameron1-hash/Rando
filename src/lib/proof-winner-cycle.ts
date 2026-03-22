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
  lastKnownClaimableSol: number;
  totalClaimedSol: number;
  lastClaimCheckAt: string | null;
  lastUpdatedAt: string | null;
};

export type ProofWinnerDisqualificationRecord = {
  id: string;
  wallet: string;
  tokenAmount: number;
  reason: string;
  disqualifiedAt: string;
  claimableSolAtCheck: number;
  createdAt: string | null;
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
      last_known_claimable_sol numeric(18, 9) NOT NULL DEFAULT 0,
      total_claimed_sol numeric(18, 9) NOT NULL DEFAULT 0,
      last_claim_check_at timestamptz,
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

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_known_claimable_sol numeric(18, 9) NOT NULL DEFAULT 0
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS total_claimed_sol numeric(18, 9) NOT NULL DEFAULT 0
  `);

  await db.execute(sql`
    ALTER TABLE proof_winner_cycle
    ADD COLUMN IF NOT EXISTS last_claim_check_at timestamptz
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS proof_winner_disqualification_history (
      id text PRIMARY KEY,
      wallet text NOT NULL,
      token_amount numeric(18, 9) NOT NULL DEFAULT 0,
      reason text NOT NULL,
      disqualified_at timestamptz NOT NULL,
      claimable_sol_at_check numeric(18, 9) NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )
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
    lastKnownClaimableSol: asNumber(row.last_known_claimable_sol, 0),
    totalClaimedSol: asNumber(row.total_claimed_sol, 0),
    lastClaimCheckAt: asIsoString(row.last_claim_check_at),
    lastUpdatedAt: asIsoString(row.last_updated_at),
  };
}

function mapDisqualificationRow(
  row: Record<string, unknown>
): ProofWinnerDisqualificationRecord {
  return {
    id: asString(row.id),
    wallet: asString(row.wallet),
    tokenAmount: asNumber(row.token_amount, 0),
    reason: asString(row.reason),
    disqualifiedAt:
      asIsoString(row.disqualified_at) || new Date().toISOString(),
    claimableSolAtCheck: asNumber(row.claimable_sol_at_check, 0),
    createdAt: asIsoString(row.created_at),
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
      last_known_claimable_sol,
      total_claimed_sol,
      last_claim_check_at,
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
    lastKnownClaimableSol: 0,
    totalClaimedSol: 0,
    lastClaimCheckAt: null,
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
      last_known_claimable_sol,
      total_claimed_sol,
      last_claim_check_at,
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
      ${String(defaultRecord.lastKnownClaimableSol)},
      ${String(defaultRecord.totalClaimedSol)},
      ${defaultRecord.lastClaimCheckAt},
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
      last_known_claimable_sol,
      total_claimed_sol,
      last_claim_check_at,
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
      ${String(next.lastKnownClaimableSol)},
      ${String(next.totalClaimedSol)},
      ${next.lastClaimCheckAt},
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
      last_known_claimable_sol = EXCLUDED.last_known_claimable_sol,
      total_claimed_sol = EXCLUDED.total_claimed_sol,
      last_claim_check_at = EXCLUDED.last_claim_check_at,
      last_updated_at = EXCLUDED.last_updated_at
  `);

  return next;
}

export async function recordProofWinnerDisqualification(input: {
  wallet: string;
  tokenAmount: number;
  reason: string;
  disqualifiedAt: string;
  claimableSolAtCheck: number;
}): Promise<ProofWinnerDisqualificationRecord> {
  await ensureProofWinnerCycleTableExists();

  const id = `disq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await db.execute(sql`
    INSERT INTO proof_winner_disqualification_history (
      id,
      wallet,
      token_amount,
      reason,
      disqualified_at,
      claimable_sol_at_check
    )
    VALUES (
      ${id},
      ${input.wallet},
      ${String(input.tokenAmount)},
      ${input.reason},
      ${input.disqualifiedAt},
      ${String(input.claimableSolAtCheck)}
    )
  `);

  await db.execute(sql`
    DELETE FROM proof_winner_disqualification_history
    WHERE id IN (
      SELECT id
      FROM proof_winner_disqualification_history
      ORDER BY disqualified_at DESC, created_at DESC
      OFFSET 3
    )
  `);

  const result = await db.execute(sql`
    SELECT
      id,
      wallet,
      token_amount,
      reason,
      disqualified_at,
      claimable_sol_at_check,
      created_at
    FROM proof_winner_disqualification_history
    WHERE id = ${id}
    LIMIT 1
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error('Failed to load saved disqualification record');
  }

  return mapDisqualificationRow(row);
}

export async function getRecentProofWinnerDisqualifications(
  limit = 3
): Promise<ProofWinnerDisqualificationRecord[]> {
  await ensureProofWinnerCycleTableExists();

  const safeLimit = Math.max(1, Math.min(limit, 20));

  const result = await db.execute(sql`
    SELECT
      id,
      wallet,
      token_amount,
      reason,
      disqualified_at,
      claimable_sol_at_check,
      created_at
    FROM proof_winner_disqualification_history
    ORDER BY disqualified_at DESC, created_at DESC
    LIMIT ${safeLimit}
  `);

  return result.rows.map((row) =>
    mapDisqualificationRow(row as Record<string, unknown>)
  );
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
    lastKnownClaimableSol: 0,
    totalClaimedSol: 0,
    lastClaimCheckAt: null,
  });
}