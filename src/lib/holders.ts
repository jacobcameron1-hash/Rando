import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';

export interface HolderBalance {
  wallet: string;
  balance: bigint;
}

export interface CandidatePoolResult {
  candidates: HolderBalance[];
  minBalance: bigint;
  totalSupply: bigint;
}

export type VerificationReason =
  | 'passed'
  | 'below_threshold_now'
  | 'no_token_accounts'
  | 'dropped_below_threshold'
  | 'rpc_error';

export interface VerificationResult {
  wallet: string;
  passed: boolean;
  reason: VerificationReason;
}

/**
 * Fetch all token holders for a given mint using getProgramAccounts.
 * Returns wallets with non-zero balances, grouped across multiple token accounts.
 */
export async function snapshotHolders(
  connection: Connection,
  mintAddress: string,
): Promise<HolderBalance[]> {
  const mint = new PublicKey(mintAddress);

  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: AccountLayout.span },
      { memcmp: { offset: 0, bytes: mint.toBase58() } },
    ],
    commitment: 'confirmed',
  });

  const byWallet = new Map<string, bigint>();

  for (const { account } of accounts) {
   const data = AccountLayout.decode(account.data) as {
  owner: PublicKey;
  amount: bigint;
};
    if (data.amount > BigInt(0)) {
  const wallet = data.owner.toBase58();
  byWallet.set(wallet, (byWallet.get(wallet) ?? BigInt(0)) + data.amount);
}

  return Array.from(byWallet.entries()).map(([wallet, balance]) => ({
    wallet,
    balance,
  }));
}

export async function getTokenSupply(
  connection: Connection,
  mintAddress: string,
): Promise<bigint> {
  const info = await connection.getTokenSupply(new PublicKey(mintAddress));
  return BigInt(info.value.amount);
}

export function calcMinBalance(
  eligibilityType: 'percent' | 'amount',
  eligibilityValue: string,
  totalSupply: bigint,
  decimals: number,
): bigint {
  if (eligibilityType === 'amount') {
    const rawAmount = parseFloat(eligibilityValue);
    return BigInt(Math.floor(rawAmount * 10 ** decimals));
  }

  const pct = parseFloat(eligibilityValue) / 100;
  return BigInt(Math.floor(Number(totalSupply) * pct));
}

/**
 * Build the current candidate pool.
 * Everyone above threshold right now gets one equal-probability ticket.
 */
export async function buildCandidatePool(
  connection: Connection,
  mintAddress: string,
  eligibilityType: 'percent' | 'amount',
  eligibilityValue: string,
  decimals: number,
): Promise<CandidatePoolResult> {
  const holders = await snapshotHolders(connection, mintAddress);
  const totalSupply = await getTokenSupply(connection, mintAddress);
  const minBalance = calcMinBalance(
    eligibilityType,
    eligibilityValue,
    totalSupply,
    decimals,
  );

  const candidates = holders.filter((h) => h.balance >= minBalance);

  return { candidates, minBalance, totalSupply };
}

/**
 * Verify that a wallet continuously held at least minBalance from intervalStartUnix until now.
 * Transfers out are treated the same as sells because we only care whether the wallet's
 * balance ever dipped below the threshold.
 */
export async function verifyCandidateContinuousHold(
  connection: Connection,
  mintAddress: string,
  wallet: string,
  minBalance: bigint,
  intervalStartUnix: number,
): Promise<VerificationResult> {
  try {
    const owner = new PublicKey(wallet);
    const mint = new PublicKey(mintAddress);

    const tokenAccounts = await connection.getTokenAccountsByOwner(owner, { mint });
    if (tokenAccounts.value.length === 0) {
      return { wallet, passed: false, reason: 'no_token_accounts' };
    }

    let currentBalance = BigInt(0);
    const accountPubkeys = tokenAccounts.value.map((a) => a.pubkey);

    for (const acc of tokenAccounts.value) {
      const decoded = AccountLayout.decode(acc.account.data) as {
        amount: bigint;
      };
      currentBalance += decoded.amount;
    }

    if (currentBalance < minBalance) {
      return { wallet, passed: false, reason: 'below_threshold_now' };
    }

    const sigArrays = await Promise.all(
      accountPubkeys.map((pubkey) =>
        connection.getSignaturesForAddress(pubkey, { limit: 200 }),
      ),
    );

    const allSignatures = sigArrays
      .flat()
      .filter((s) => s.blockTime && s.blockTime >= intervalStartUnix);

    const uniqueSigs = [
      ...new Map(allSignatures.map((s) => [s.signature, s])).values(),
    ].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));

    let runningBalance = currentBalance;

    for (let i = 0; i < uniqueSigs.length; i += 20) {
      const chunk = uniqueSigs.slice(i, i + 20);

      const txs = await Promise.all(
        chunk.map((s) =>
          connection.getTransaction(s.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          }),
        ),
      );

      for (const tx of txs) {
        if (!tx?.meta) continue;

        const pre = tx.meta.preTokenBalances ?? [];
        const post = tx.meta.postTokenBalances ?? [];

        for (let j = 0; j < post.length; j++) {
          const preBal = pre[j];
          const postBal = post[j];
          if (!preBal || !postBal) continue;

          if (postBal.owner === wallet && postBal.mint === mintAddress) {
            const delta =
              BigInt(postBal.uiTokenAmount.amount) -
              BigInt(preBal.uiTokenAmount.amount);

            runningBalance -= delta;

            if (runningBalance < minBalance) {
              return {
                wallet,
                passed: false,
                reason: 'dropped_below_threshold',
              };
            }
          }
        }
      }
    }

    return { wallet, passed: true, reason: 'passed' };
  } catch (error) {
    console.error('[holders] verification failed:', wallet, error);
    return { wallet, passed: false, reason: 'rpc_error' };
  }
}
