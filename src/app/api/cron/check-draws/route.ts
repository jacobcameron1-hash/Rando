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
 * 3. Build current candidate pool from holders above threshold
 * 4. Deterministically order candidates (equal chance for each)
 * 5. Verify candidates one by one for continuous holding across the interval
 * 6. Send prize SOL to first valid winner (or roll over)
 * 7. Record draw result
 * 8. Take new start-of-interval snapshot for next draw
 * 9. Schedule next draw time
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
  buildCandidatePool,
  verifyCandidateContinuousHold,
} from '@/lib/holders';
import { buildCandidateOrder } from '@/lib/lottery';
import { calcNextDrawTime } from '@/lib/interval';
import { nanoid } from '@/lib/nanoid';

const RESERVE_LAMPORTS = 1_000_000; // 0.001 SOL kept for future tx fees

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

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
  const attemptedDrawNumber = project.drawCount + 1;

  await claimFeesForVault(vaultKeypair, project.tokenMint);

  const vaultBalance = await getVaultBalance(project.vaultPublicKey);
  const prizeAmount = Math.max(0, vaultBalance - RESERVE_LAMPORTS);

  const endHolders = await snapshotHolders(connection, project.tokenMint);

  const [startSnap] = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.projectId, project.id),
        eq(snapshots.drawNumber, project.drawCount),
      ),
    )
    .limit(1);

  let winnerResult = {
    winner: null as string | null,
    rolledOver: true,
    attempts: 0,
  };
  let prizeTxSig: string | undefined;

  if (startSnap && prizeAmount > 0) {
    const tokenDecimals = await getTokenDecimals(project.tokenMint);

    const { candidates, minBalance } = await buildCandidatePool(
      connection,
      project.tokenMint,
      project.eligibilityType as 'percent' | 'amount',
      project.eligibilityValue,
      tokenDecimals,
    );

    const intervalStartUnix = Math.floor(startSnap.takenAt.getTime() / 1000);

    const seedInput = [
      project.tokenMint,
      project.id,
      attemptedDrawNumber,
      project.nextDrawAt.toISOString(),
    ].join(':');

    const { ordered } = buildCandidateOrder(candidates, seedInput);

    let attempts = 0;

    for (const candidate of ordered) {
      attempts += 1;

      const result = await verifyCandidateContinuousHold(
        connection,
        project.tokenMint,
        candidate.wallet,
        minBalance,
        intervalStartUnix,
      );

      if (result.passed) {
        winnerResult = {
          winner: candidate.wallet,
          rolledOver: false,
          attempts,
        };
        break;
      }
    }

    if (winnerResult.winner && prizeAmount > 0) {
      try {
        prizeTxSig = await sendPrize(
          vaultKeypair,
          winnerResult.winner,
          prizeAmount,
        );
      } catch (err) {
        console.error('[cron] Prize send failed:', err);
        winnerResult = {
          winner: null,
          rolledOver: true,
          attempts: winnerResult.attempts,
        };
      }
    }
  }

  const completedDrawNumber = winnerResult.rolledOver
    ? project.drawCount
    : attemptedDrawNumber;

  if (winnerResult.winner && !winnerResult.rolledOver) {
    await db.insert(draws).values({
      id: nanoid(),
      projectId: project.id,
      drawNumber: attemptedDrawNumber,
      winnerWallet: winnerResult.winner,
      prizeAmountLamports: prizeAmount,
      prizeTxSignature: prizeTxSig ?? null,
      attempts: winnerResult.attempts,
      rolledOver: false,
    });
  } else {
    console.log(
      `[cron] Draw rollover for project ${project.id}; threshold not met or no payable winner`
    );
  }

  await db.insert(snapshots).values({
    id: nanoid(),
    projectId: project.id,
    drawNumber: completedDrawNumber,
    holders: endHolders.map((h) => ({
      wallet: h.wallet,
      balance: h.balance.toString(),
    })),
  });

  const nextDrawAt = calcNextDrawTime(
    project.baseIntervalMs,
    project.incrementMs,
    project.capMs,
    completedDrawNumber,
  );

  await db
    .update(projects)
    .set({
      drawCount: completedDrawNumber,
      nextDrawAt,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));

  return {
    drawNumber: attemptedDrawNumber,
    completedDrawNumber,
    winner: winnerResult.winner,
    rolledOver: winnerResult.rolledOver,
    prizeAmountSol: prizeAmount / 1e9,
    txSignature: prizeTxSig,
    nextDrawAt: nextDrawAt.toISOString(),
  };
}