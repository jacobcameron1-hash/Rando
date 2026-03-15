/**
 * POST /api/projects/[id]/lock
 *
 * Returns a serialized transaction for the launcher to sign that transfers
 * fee share admin to the Solana system program (irreversible lock).
 *
 * After the launcher signs and submits the transaction on-chain,
 * they call this endpoint again with { confirmed: true, txSignature } to
 * mark the project as locked in our DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, projects } from '@/db';
import { eq } from 'drizzle-orm';
import { buildAdminLockTransaction } from '@/lib/bags';

export async function POST(
  req: NextRequest,
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

    if (project.isLocked) {
      return NextResponse.json({ error: 'Project is already locked' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    // Step 2: Launcher has confirmed the lock tx on-chain
    if (body.confirmed && body.txSignature) {
      await db
        .update(projects)
        .set({ isLocked: true, updatedAt: new Date() })
        .where(eq(projects.id, id));

      return NextResponse.json({ locked: true, txSignature: body.txSignature });
    }

    // Step 1: Return the lock transaction for client signing
    const serializedTx = await buildAdminLockTransaction(
      project.tokenMint,
      project.creatorWallet,
    );

    return NextResponse.json({
      lockTransaction: serializedTx,
      warning:
        'This action is IRREVERSIBLE. Once signed and submitted, the fee share ' +
        'admin cannot be changed. The split configuration will be permanent.',
    });
  } catch (err) {
    console.error(`[POST /api/projects/${id}/lock]`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
