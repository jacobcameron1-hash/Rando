/**
 * Bags.fm SDK wrapper for Rando.
 *
 * Covers:
 * - Fee share config update (set vault as a claimer post-launch)
 * - Fee claiming (pull accumulated fees into vault)
 * - Admin lock (transfer admin to system program — irreversible)
 */

import { BagsSDK } from "@bagsfm/bags-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";

// The Solana system program address is the "dead" admin address for locking
export const SYSTEM_PROGRAM_ADDRESS = SystemProgram.programId.toBase58();

export function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL env var is not set");
  return new Connection(rpc, "confirmed");
}

export function getSDK(connection?: Connection): BagsSDK {
  const apiKey = process.env.BAGS_API_KEY;
  if (!apiKey) throw new Error("BAGS_API_KEY env var is not set");

  const conn = connection ?? getConnection();
  return new BagsSDK(apiKey, conn, "confirmed");
}

function getFeeShareAdmin(sdk: BagsSDK) {
  const feeShareAdmin = (sdk as unknown as {
    feeShareAdmin?: {
      getUpdateConfigTransactions: (args: {
        baseMint: PublicKey;
        feeClaimers: Array<{ user: PublicKey; userBps: number }>;
        payer: PublicKey;
      }) => Promise<Array<{ transaction: VersionedTransaction }>>;
      getTransferAdminTransaction: (args: {
        baseMint: PublicKey;
        currentAdmin: PublicKey;
        newAdmin: PublicKey;
        payer: PublicKey;
      }) => Promise<{ transaction: VersionedTransaction }>;
    };
  }).feeShareAdmin;

  if (!feeShareAdmin) {
    throw new Error(
      "Bags SDK feeShareAdmin API is unavailable in the installed SDK version"
    );
  }

  return feeShareAdmin;
}

/**
 * Build the fee share update transactions to add the vault as a claimer.
 * Returns serialized VersionedTransactions (base64) for client signing.
 */
export async function buildFeeShareSetupTransactions(
  baseMint: string,
  launcherWallet: string,
  vaultPublicKey: string,
  vaultBps: number = 9500
): Promise<string[]> {
  const sdk = getSDK();
  const feeShareAdmin = getFeeShareAdmin(sdk);

  const feeClaimers = [
    {
      user: new PublicKey(vaultPublicKey),
      userBps: vaultBps,
    },
  ];

  const txResults = await feeShareAdmin.getUpdateConfigTransactions({
    baseMint: new PublicKey(baseMint),
    feeClaimers,
    payer: new PublicKey(launcherWallet),
  });

  return txResults.map(({ transaction }) =>
    Buffer.from(transaction.serialize()).toString("base64")
  );
}

/**
 * Claim all accumulated fees for the vault keypair.
 * Returns approximate total lamports claimed.
 */
export async function claimFeesForVault(
  vaultKeypair: Keypair,
  baseMint: string
): Promise<number> {
  const connection = getConnection();
  const sdk = getSDK(connection);

  const positions = await sdk.fee.getAllClaimablePositions(
    vaultKeypair.publicKey
  );

  const relevant = positions.filter(
    (p: Record<string, unknown>) =>
      !p["baseMint"] || p["baseMint"] === baseMint
  );

  let totalClaimed = 0;

  for (const position of relevant) {
    try {
      const claimTxArray: VersionedTransaction[] =
        await sdk.fee.getClaimTransactions(vaultKeypair.publicKey, position);

      for (const tx of claimTxArray) {
        tx.sign([vaultKeypair]);

        const signature = await connection.sendTransaction(tx, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        await connection.confirmTransaction(signature, "confirmed");
      }

      const amount = (position as Record<string, unknown>)["amount"];
      if (typeof amount === "number") {
        totalClaimed += Math.floor(amount * LAMPORTS_PER_SOL);
      }
    } catch (err) {
      console.error("[bags] Claim failed:", err);
    }
  }

  return totalClaimed;
}

/**
 * Get the SOL balance of the vault in lamports.
 */
export async function getVaultBalance(
  vaultPublicKey: string
): Promise<number> {
  return getConnection().getBalance(new PublicKey(vaultPublicKey));
}

/**
 * Send prize SOL from vault to winner. Returns tx signature.
 */
export async function sendPrize(
  vaultKeypair: Keypair,
  winnerWallet: string,
  prizeAmountLamports: number
): Promise<string> {
  const connection = getConnection();

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: vaultKeypair.publicKey,
      toPubkey: new PublicKey(winnerWallet),
      lamports: prizeAmountLamports,
    })
  );

  return sendAndConfirmTransaction(connection, tx, [vaultKeypair], {
    commitment: "confirmed",
  });
}

/**
 * Build the admin lock transaction.
 * Returns base64-serialized VersionedTransaction.
 */
export async function buildAdminLockTransaction(
  baseMint: string,
  currentAdmin: string
): Promise<string> {
  const sdk = getSDK();
  const feeShareAdmin = getFeeShareAdmin(sdk);

  const { transaction } = await feeShareAdmin.getTransferAdminTransaction({
    baseMint: new PublicKey(baseMint),
    currentAdmin: new PublicKey(currentAdmin),
    newAdmin: new PublicKey(SYSTEM_PROGRAM_ADDRESS),
    payer: new PublicKey(currentAdmin),
  });

  return Buffer.from(transaction.serialize()).toString("base64");
}

/**
 * Get token decimals from the mint account.
 */
export async function getTokenDecimals(
  mintAddress: string
): Promise<number> {
  const connection = getConnection();
  const info = await connection.getParsedAccountInfo(new PublicKey(mintAddress));

  if (!info.value) {
    throw new Error(`Mint not found: ${mintAddress}`);
  }

  const parsed = (
    info.value.data as { parsed?: { info?: { decimals?: number } } }
  )?.parsed?.info;

  return parsed?.decimals ?? 9;
}