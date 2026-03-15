/**
 * POST /api/projects
 *
 * Creates a new Rando project. Generates a vault keypair, stores the project
 * config, takes an initial holder snapshot, and returns the fee share setup
 * transactions for the launcher to sign client-side.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, projects, snapshots } from '@/db';
import { generateVaultKeypair, encryptKeypair } from '@/lib/vault';
import { parseInterval, calcNextDrawTime } from '@/lib/interval';
import { snapshotHolders } from '@/lib/holders';
import { buildFeeShareSetupTransactions, getConnection } from '@/lib/bags';
import { nanoid } from '@/lib/nanoid';

export interface CreateProjectBody {
  tokenMint: string;
  creatorWallet: string;
  eligibilityType: 'percent' | 'amount';
  eligibilityValue: string;
  baseInterval: string;
  incrementInterval: string;
  capInterval: string;
  vaultBps?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateProjectBody = await req.json();

    const {
      tokenMint,
      creatorWallet,
      eligibilityType,
      eligibilityValue,
      baseInterval,
      incrementInterval,
      capInterval,
      vaultBps = 9500,
    } = body;

    if (!tokenMint || !creatorWallet || !eligibilityType || !eligibilityValue) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['percent', 'amount'].includes(eligibilityType)) {
      return NextResponse.json(
        { error: 'eligibilityType must be "percent" or "amount"' },
        { status: 400 },
      );
    }

    const baseMs = parseInterval(baseInterval);
    const incrementMs = parseInterval(incrementInterval || '0');
    const capMs = parseInterval(capInterval);

    if (capMs < baseMs) {
      return NextResponse.json({ error: 'Cap must be >= base interval' }, { status: 400 });
    }

    const vaultKeypair = generateVaultKeypair();
    const vaultPublicKey = vaultKeypair.publicKey.toBase58();
    const vaultKeypairEncrypted = encryptKeypair(vaultKeypair);

    const nextDrawAt = calcNextDrawTime(baseMs, incrementMs, capMs, 0);

    const projectId = nanoid();
    await db.insert(projects).values({
      id: projectId,
      tokenMint,
      vaultPublicKey,
      vaultKeypairEncrypted,
      eligibilityType,
      eligibilityValue,
      baseIntervalMs: baseMs,
      incrementMs,
      capMs,
      drawCount: 0,
      nextDrawAt,
      isLocked: false,
      isActive: true,
      creatorWallet,
    });

    // Initial holder snapshot (start of first interval)
    const connection = getConnection();
    const holders = await snapshotHolders(connection, tokenMint);
    await db.insert(snapshots).values({
      id: nanoid(),
      projectId,
      drawNumber: 0,
      holders: holders.map((h) => ({
        wallet: h.wallet,
        balance: h.balance.toString(),
      })),
    });

    // Build fee share setup transactions for client signing
    const setupTransactions = await buildFeeShareSetupTransactions(
      tokenMint,
      creatorWallet,
      vaultPublicKey,
      vaultBps,
    );

    return NextResponse.json({
      projectId,
      vaultPublicKey,
      nextDrawAt: nextDrawAt.toISOString(),
      setupTransactions, // array of base64 VersionedTransactions; launcher signs each
    });
  } catch (err) {
    console.error('[POST /api/projects]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
