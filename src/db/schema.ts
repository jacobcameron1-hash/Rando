import { pgTable, text, integer, bigint, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(), // nanoid
  tokenMint: text('token_mint').notNull(),
  vaultPublicKey: text('vault_public_key').notNull(),
  vaultKeypairEncrypted: text('vault_keypair_encrypted').notNull(), // AES-256 encrypted JSON
  // Eligibility
  eligibilityType: text('eligibility_type').notNull(), // 'percent' | 'amount'
  eligibilityValue: text('eligibility_value').notNull(), // decimal string (e.g. "1.5" for 1.5% or "1000000" for raw amount)
  // Interval config
  baseIntervalMs: bigint('base_interval_ms', { mode: 'number' }).notNull(),
  incrementMs: bigint('increment_ms', { mode: 'number' }).notNull(), // 0 for flat
  capMs: bigint('cap_ms', { mode: 'number' }).notNull(),
  // State
  drawCount: integer('draw_count').notNull().default(0),
  nextDrawAt: timestamp('next_draw_at').notNull(),
  isLocked: boolean('is_locked').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  // Metadata
  creatorWallet: text('creator_wallet').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const draws = pgTable('draws', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  drawNumber: integer('draw_number').notNull(),
  winnerWallet: text('winner_wallet'), // null if rollover (no eligible winner)
  prizeAmountLamports: bigint('prize_amount_lamports', { mode: 'number' }),
  prizeTxSignature: text('prize_tx_signature'),
  attempts: integer('attempts').notNull().default(0),
  rolledOver: boolean('rolled_over').notNull().default(false),
  executedAt: timestamp('executed_at').notNull().defaultNow(),
});

export const snapshots = pgTable('snapshots', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  drawNumber: integer('draw_number').notNull(), // snapshot taken at START of this draw period
  takenAt: timestamp('taken_at').notNull().defaultNow(),
  holders: jsonb('holders').notNull(), // Array<{ wallet: string, balance: string }>
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Draw = typeof draws.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
