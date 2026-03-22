import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  tokenMint: text('token_mint').notNull(),
  vaultPublicKey: text('vault_public_key').notNull(),
  vaultKeypairEncrypted: text('vault_keypair_encrypted').notNull(),
  eligibilityType: text('eligibility_type').notNull(),
  eligibilityValue: text('eligibility_value').notNull(),
  baseIntervalMs: bigint('base_interval_ms', { mode: 'number' }).notNull(),
  incrementMs: bigint('increment_ms', { mode: 'number' }).notNull(),
  capMs: bigint('cap_ms', { mode: 'number' }).notNull(),
  drawCount: integer('draw_count').notNull().default(0),
  nextDrawAt: timestamp('next_draw_at').notNull(),
  isLocked: boolean('is_locked').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  creatorWallet: text('creator_wallet').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const draws = pgTable('draws', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  drawNumber: integer('draw_number').notNull(),
  winnerWallet: text('winner_wallet'),
  prizeAmountLamports: bigint('prize_amount_lamports', { mode: 'number' }),
  prizeTxSignature: text('prize_tx_signature'),
  attempts: integer('attempts').notNull().default(0),
  rolledOver: boolean('rolled_over').notNull().default(false),
  executedAt: timestamp('executed_at').notNull().defaultNow(),
});

export const snapshots = pgTable('snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  drawNumber: integer('draw_number').notNull(),
  takenAt: timestamp('taken_at').notNull().defaultNow(),
  holders: jsonb('holders').notNull(),
});

export const proofHistory = pgTable('proof_history', {
  drawId: text('draw_id').primaryKey(),
  snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull(),
  tokenMint: text('token_mint').notNull(),
  slotId: text('slot_id'),
  scheduledDrawAt: timestamp('scheduled_draw_at', { withTimezone: true }),
  winner: jsonb('winner').notNull(),
  counts: jsonb('counts').notNull(),
});

export const drawAdminConfig = pgTable('draw_admin_config', {
  id: text('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(true),
  timezone: text('timezone').notNull(),
  firstDrawAt: timestamp('first_draw_at', { withTimezone: true }).notNull(),
  initialIntervalHours: integer('initial_interval_hours').notNull(),
  increaseEnabled: boolean('increase_enabled').notNull().default(false),
  increaseHoursPerDraw: integer('increase_hours_per_draw').notNull().default(0),
  maxIntervalHours: integer('max_interval_hours').notNull(),
  minTokens: integer('min_tokens').notNull(),
  minPayoutSol: numeric('min_payout_sol', { precision: 18, scale: 9 })
    .notNull()
    .default('0.05'),
  excludedWallets: jsonb('excluded_wallets').notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const proofWinnerCycle = pgTable('proof_winner_cycle', {
  id: text('id').primaryKey(),
  tokenMint: text('token_mint').notNull(),
  activeWinnerWallet: text('active_winner_wallet'),
  cycleStartedAt: timestamp('cycle_started_at', { withTimezone: true }),
  cycleCompletedAt: timestamp('cycle_completed_at', { withTimezone: true }),
  status: text('status').notNull().default('idle'),
  minPayoutSol: numeric('min_payout_sol', { precision: 18, scale: 9 })
    .notNull()
    .default('0.05'),
  accumulatedSol: numeric('accumulated_sol', { precision: 18, scale: 9 })
    .notNull()
    .default('0'),
  targetReached: boolean('target_reached').notNull().default(false),
  lastDrawId: text('last_draw_id'),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Draw = typeof draws.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type ProofHistory = typeof proofHistory.$inferSelect;
export type NewProofHistory = typeof proofHistory.$inferInsert;
export type DrawAdminConfig = typeof drawAdminConfig.$inferSelect;
export type NewDrawAdminConfig = typeof drawAdminConfig.$inferInsert;
export type ProofWinnerCycle = typeof proofWinnerCycle.$inferSelect;
export type NewProofWinnerCycle = typeof proofWinnerCycle.$inferInsert;