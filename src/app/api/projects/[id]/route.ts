/**
 * GET /api/projects/[id]
 *
 * Returns full project details including draw history and vault balance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, projects, draws, snapshots } from '@/db';
import { eq, desc } from 'drizzle-orm';
import { getVaultBalance } from '@/lib/bags';
import { nextIntervalMs, formatInterval } from '@/lib/interval';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch recent draws
    const recentDraws = await db
      .select()
      .from(draws)
      .where(eq(draws.projectId, id))
      .orderBy(desc(draws.drawNumber))
      .limit(20);

    // Get live vault balance
    const vaultBalanceLamports = await getVaultBalance(project.vaultPublicKey);

    // Calculate current interval duration
    const currentIntervalMs = nextIntervalMs(
      project.baseIntervalMs,
      project.incrementMs,
      project.capMs,
      project.drawCount,
    );

    return NextResponse.json({
      id: project.id,
      tokenMint: project.tokenMint,
      vaultPublicKey: project.vaultPublicKey,
      eligibilityType: project.eligibilityType,
      eligibilityValue: project.eligibilityValue,
      baseInterval: formatInterval(project.baseIntervalMs),
      increment: formatInterval(project.incrementMs),
      cap: formatInterval(project.capMs),
      currentInterval: formatInterval(currentIntervalMs),
      drawCount: project.drawCount,
      nextDrawAt: project.nextDrawAt,
      isLocked: project.isLocked,
      isActive: project.isActive,
      creatorWallet: project.creatorWallet,
      vaultBalanceLamports,
      vaultBalanceSol: vaultBalanceLamports / 1e9,
      draws: recentDraws.map((d) => ({
        drawNumber: d.drawNumber,
        winner: d.winnerWallet,
        prizeAmountSol: d.prizeAmountLamports
          ? d.prizeAmountLamports / 1e9
          : null,
        txSignature: d.prizeTxSignature,
        rolledOver: d.rolledOver,
        attempts: d.attempts,
        executedAt: d.executedAt,
      })),
    });
  } catch (err) {
    console.error(`[GET /api/projects/${id}]`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
