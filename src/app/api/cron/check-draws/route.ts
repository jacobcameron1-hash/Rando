/**
 * GET /api/cron/check-draws
 *
 * Vercel Cron Job — runs every minute.
 * Checks all active projects for draws that are due, executes them, and
 * schedules the next draw.
 *
 * Draw execution:
 * 1. Claim all accumulated fees into vault
 * 2. Take end-of-interval holder snapshot
 * 3. Find eligible holders (in both snapshots, above min balance)
 * 4. Select winner via rejection sampling
 * 5. Send prize SOL to winner (or roll over)
 * 6. Record draw result
 * 7. Take new start-of-interval snapshot for next draw
 * 8. Schedule next draw time
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, projects, draws, snapshots } from '@/db';
import { eq, lte, and } from 'drizzle-orm';
import { decryptKeypair } from '@/lib/vault';
import {
  claimFeesForVault,
  getVaultBalance,
  sendPrize,
  getConnection,
  getTokenDecimals,
} from '@/lib/bags';
import {
  snapshotHolders,
  getEligibleHolders,
  calcMinBalance,
} from '@/lib/holders';
import { selectWinner } from '@/lib/lottery';
import { calcNextDrawTime } from '@/lib/interval';
import { nanoid } from '@/lib/nanoid';

const RESERVE_LAMPORTS = 1_000_000; // 0.001 SOL kept for future tx fees

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized execution
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Find all active projects with a draw due
  const dueProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.isActive, true), lte(projects.nextDrawAt, now)));

  console.log(`[cron] ${dueProjects.length} projects due for draw`);

  const results = [];

  for (const project of dueProjects) {
    try {
      const result = await executeDraw(project);
      results.push({ projectId: project.id, ...result });
    } catch (err) {
      console.error(`[cron] Draw failed for project ${project.id}:`, err);
      results.push({
        projectId: project.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({ processed: dueProjects.length, results });
}

async function executeDraw(project: typeof projects.$inferSelect) {
  const connection = getConnection();
  const vaultKeypair = decryptKeypair(project.vaultKeypairEncrypted);
  const drawNumber = project.drawCount + 1;

  // 1. Claim all pending fees into the vault
  await claimFeesForVault(vaultKeypair, project.tokenMint);

  // 2. Get vault balance (prize pool)
  const vaultBalance = await getVaultBalance(project.vaultPublicKey);
  const prizeAmount = Math.max(0, vaultBalance - RESERVE_LAMPORTS);

  // 3. Take end-of-interval snapshot
  const endHolders = await snapshotHolders(connection, project.tokenMint);

  // 4. Get the start-of-interval snapshot
  const [startSnap] = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.projectId, project.id),
        eq(snapshots.drawNumber, project.drawCount), // last draw's number = this interval's start
      ),
    )
    .limit(1);

  let winnerResult = { winner: null as string | null, rolledOver: true, attempts: 0 };
  let prizeTxSig: string | undefined;

  if (startSnap && prizeAmount > 0) {
    // 5. Parse start snapshot holders
    const startHolders = (
      startSnap.holders as Array<{ wallet: string; balance: string }>
    ).map((h) => ({
      wallet: h.wallet,
      balance: BigInt(h.balance),
    }));

    // 6. Calculate minimum balance threshold
    const tokenDecimals = await getTokenDecimals(project.tokenMint);
    const totalSupplyInfo = await connection.getTokenSupply(
      new (await import('@solana/web3.js')).PublicKey(project.tokenMint),
    );
    const totalSupply = BigInt(totalSupplyInfo.value.amount);

    const minBalance = calcMinBalance(
      project.eligibilityType as 'percent' | 'amount',
      project.eligibilityValue,
      totalSupply,
      tokenDecimals,
    );

    // 7. Find eligible holders
    const eligible = getEligibleHolders(startHolders, endHolders, minBalance);

    // 8. Select winner
    winnerResult = selectWinner(eligible);

    // 9. Send prize if winner found
    if (winnerResult.winner && prizeAmount > 0) {
      try {
        prizeTxSig = await sendPrize(vaultKeypair, winnerResult.winner, prizeAmount);
      } catch (err) {
        console.error('[cron] Prize send failed:', err);
        winnerResult = { winner: null, rolledOver: true, attempts: winnerResult.attempts };
      }
    }
  }

  // 10. Record draw
  await db.insert(draws).values({
    id: nanoid(),
    projectId: project.id,
    drawNumber,
    winnerWallet: winnerResult.winner ?? null,
    prizeAmountLamports: winnerResult.winner ? prizeAmount : null,
    prizeTxSignature: prizeTxSig ?? null,
    attempts: winnerResult.attempts,
    rolledOver: winnerResult.rolledOver,
  });

  // 11. Take start-of-next-interval snapshot
  const nextSnap = await snapshotHolders(connection, project.tokenMint);
  await db.insert(snapshots).values({
    id: nanoid(),
    projectId: project.id,
    drawNumber, // this becomes the start snapshot for draw (drawNumber+1)
    holders: nextSnap.map((h) => ({
      wallet: h.wallet,
      balance: h.balance.toString(),
    })),
  });

  // 12. Update project state
  const nextDrawAt = calcNextDrawTime(
    project.baseIntervalMs,
    project.incrementMs,
    project.capMs,
    drawNumber, // use new drawCount
  );

  await db
    .update(projects)
    .set({
      drawCount: drawNumber,
      nextDrawAt,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  return {
    drawNumber,
    winner: winnerResult.winner,
    rolledOver: winnerResult.rolledOver,
    prizeAmountSol: prizeAmount / 1e9,
    txSignature: prizeTxSig,
    nextDrawAt: nextDrawAt.toISOString(),
  };
}
