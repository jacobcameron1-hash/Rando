import { db } from '@/db';
import { sql } from 'drizzle-orm';

export type ProofHistoryItem = {
  drawId: string;
  snapshotAt: string;
  tokenMint: string;
  slotId?: string;
  scheduledDrawAt?: string;
  winner: {
    owner: string;
    uiAmount: number;
    winnerIndex: number;
  };
  counts: {
    totalTokenAccounts: number;
    totalHolders: number;
    holderCountAfterExclusions: number;
    eligibleCount: number;
    excludedWalletCount: number;
    pagesScanned: number;
  };
};

let tableReady = false;

async function ensureHistoryTableExists() {
  if (tableReady) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS proof_history (
      draw_id text PRIMARY KEY,
      snapshot_at timestamptz NOT NULL,
      token_mint text NOT NULL,
      slot_id text,
      scheduled_draw_at timestamptz,
      winner jsonb NOT NULL,
      counts jsonb NOT NULL
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS proof_history_snapshot_at_idx ON proof_history (snapshot_at DESC)`
  );

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS proof_history_slot_id_idx ON proof_history (slot_id)`
  );

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS proof_history_slot_id_unique_idx
    ON proof_history (slot_id)
    WHERE slot_id IS NOT NULL
  `);

  tableReady = true;
}

function mapRowToItem(row: any): ProofHistoryItem {
  return {
    drawId: row.draw_id,
    snapshotAt:
      row.snapshot_at instanceof Date
        ? row.snapshot_at.toISOString()
        : new Date(row.snapshot_at).toISOString(),
    tokenMint: row.token_mint,
    slotId: row.slot_id || undefined,
    scheduledDrawAt: row.scheduled_draw_at
      ? row.scheduled_draw_at instanceof Date
        ? row.scheduled_draw_at.toISOString()
        : new Date(row.scheduled_draw_at).toISOString()
      : undefined,
    winner: row.winner,
    counts: row.counts,
  };
}

export async function readProofHistory(): Promise<ProofHistoryItem[]> {
  await ensureHistoryTableExists();

  try {
    const result = await db.execute(sql`
      SELECT
        draw_id,
        snapshot_at,
        token_mint,
        slot_id,
        scheduled_draw_at,
        winner,
        counts
      FROM proof_history
      ORDER BY snapshot_at DESC
    `);

    return result.rows.map(mapRowToItem);
  } catch (error) {
    console.error('readProofHistory error', error);
    return [];
  }
}

export async function writeProofHistory(
  items: ProofHistoryItem[]
): Promise<void> {
  await ensureHistoryTableExists();

  await db.execute(sql`DELETE FROM proof_history`);

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO proof_history (
        draw_id,
        snapshot_at,
        token_mint,
        slot_id,
        scheduled_draw_at,
        winner,
        counts
      )
      VALUES (
        ${item.drawId},
        ${item.snapshotAt},
        ${item.tokenMint},
        ${item.slotId ?? null},
        ${item.scheduledDrawAt ?? null},
        ${JSON.stringify(item.winner)}::jsonb,
        ${JSON.stringify(item.counts)}::jsonb
      )
    `);
  }
}

export async function prependProofHistoryItem(
  item: ProofHistoryItem
): Promise<ProofHistoryItem[]> {
  await ensureHistoryTableExists();

  await db.execute(sql`
    INSERT INTO proof_history (
      draw_id,
      snapshot_at,
      token_mint,
      slot_id,
      scheduled_draw_at,
      winner,
      counts
    )
    VALUES (
      ${item.drawId},
      ${item.snapshotAt},
      ${item.tokenMint},
      ${item.slotId ?? null},
      ${item.scheduledDrawAt ?? null},
      ${JSON.stringify(item.winner)}::jsonb,
      ${JSON.stringify(item.counts)}::jsonb
    )
    ON CONFLICT DO NOTHING
  `);

  return readProofHistory();
}

export async function findProofHistoryBySlotId(
  slotId: string
): Promise<ProofHistoryItem | null> {
  await ensureHistoryTableExists();

  const result = await db.execute(sql`
    SELECT
      draw_id,
      snapshot_at,
      token_mint,
      slot_id,
      scheduled_draw_at,
      winner,
      counts
    FROM proof_history
    WHERE slot_id = ${slotId}
    ORDER BY snapshot_at DESC
    LIMIT 1
  `);

  const row = result.rows[0];
  return row ? mapRowToItem(row) : null;
}

export async function hasProofHistorySlot(slotId: string): Promise<boolean> {
  const match = await findProofHistoryBySlotId(slotId);
  return Boolean(match);
}