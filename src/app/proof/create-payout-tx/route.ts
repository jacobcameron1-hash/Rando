import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';

const RPC_URL = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
const TOKEN_MINT = process.env.RANDO_TOKEN_MINT;
const TREASURY_WALLET = process.env.RANDO_TREASURY_WALLET;
const TOKEN_DECIMALS = Number(process.env.RANDO_TOKEN_DECIMALS || 6);
const FIXED_PAYOUT_UI = Number(process.env.RANDO_PAYOUT_UI_AMOUNT || 1000000);

export async function POST(req: NextRequest) {
  try {
    if (!RPC_URL) {
      return NextResponse.json(
        { error: 'Missing SOLANA_RPC_URL' },
        { status: 500 }
      );
    }

    if (!TOKEN_MINT) {
      return NextResponse.json(
        { error: 'Missing RANDO_TOKEN_MINT' },
        { status: 500 }
      );
    }

    if (!TREASURY_WALLET) {
      return NextResponse.json(
        { error: 'Missing RANDO_TREASURY_WALLET' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const winner = body?.winner;

    if (!winner || typeof winner !== 'string') {
      return NextResponse.json(
        { error: 'Missing winner wallet' },
        { status: 400 }
      );
    }

    const connection = new Connection(RPC_URL, 'confirmed');
    const mintPk = new PublicKey(TOKEN_MINT);
    const treasuryPk = new PublicKey(TREASURY_WALLET);
    const winnerPk = new PublicKey(winner);

    const senderAta = getAssociatedTokenAddressSync(mintPk, treasuryPk);
    const winnerAta = getAssociatedTokenAddressSync(mintPk, winnerPk);

    const instructions = [];

    const winnerAtaInfo = await connection.getAccountInfo(winnerAta);
    if (!winnerAtaInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          treasuryPk,
          winnerAta,
          winnerPk,
          mintPk
        )
      );
    }

    const amountRaw =
      BigInt(FIXED_PAYOUT_UI) * (BigInt(10) ** BigInt(TOKEN_DECIMALS));

    const senderBalance = await connection.getTokenAccountBalance(senderAta).catch(() => null);

    if (!senderBalance) {
      return NextResponse.json(
        { error: 'Treasury token account not found' },
        { status: 400 }
      );
    }

    const senderAmountRaw = BigInt(senderBalance.value.amount);
    if (senderAmountRaw < amountRaw) {
      return NextResponse.json(
        {
          error: 'Treasury token balance too low',
          treasuryBalanceRaw: senderBalance.value.amount,
          requiredRaw: amountRaw.toString(),
        },
        { status: 400 }
      );
    }

    instructions.push(
      createTransferCheckedInstruction(
        senderAta,
        mintPk,
        winnerAta,
        treasuryPk,
        amountRaw,
        TOKEN_DECIMALS
      )
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');

    const message = new TransactionMessage({
      payerKey: treasuryPk,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    const serializedTransaction = Buffer.from(tx.serialize()).toString('base64');

    return NextResponse.json({
      ok: true,
      serializedTransaction,
      winner,
      winnerAta: winnerAta.toBase58(),
      senderAta: senderAta.toBase58(),
      tokenMint: mintPk.toBase58(),
      amountRaw: amountRaw.toString(),
      payoutUiAmount: FIXED_PAYOUT_UI,
      decimals: TOKEN_DECIMALS,
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error: any) {
    console.error('create-payout-tx error:', error);

    return NextResponse.json(
      {
        error: error?.message || 'Failed to create payout transaction',
      },
      { status: 500 }
    );
  }
}