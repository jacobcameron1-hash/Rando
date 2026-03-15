/**
 * Holder snapshot and eligibility utilities.
 *
 * Holder eligibility requires:
 * 1. Wallet appears in BOTH the interval-start snapshot AND end snapshot
 * 2. Balance in BOTH snapshots meets or exceeds the minimum threshold
 *
 * Snapshots are stored in the DB. One is taken at the START of each interval
 * (immediately after a draw completes). The second is taken live at draw time.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';

export interface HolderBalance {
  wallet: string;
  balance: bigint; // raw token amount (u64)
}

/**
 * Fetch all token holders for a given mint using getProgramAccounts.
 * Returns wallets with non-zero balances.
 *
 * Note: For production, replace with Helius DAS API for better performance.
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

  const holders: HolderBalance[] = [];
  for (const { account } of accounts) {
    const data = AccountLayout.decode(account.data);
    if (data.amount > BigInt(0)) {
      holders.push({
        wallet: new PublicKey(data.owner).toBase58(),
        balance: data.amount,
      });
    }
  }

  return holders;
}

/**
 * Get total supply for a token mint.
 */
export async function getTokenSupply(
  connection: Connection,
  mintAddress: string,
): Promise<bigint> {
  const info = await connection.getTokenSupply(new PublicKey(mintAddress));
  return BigInt(info.value.amount);
}

/**
 * Calculate the minimum balance a holder must have given the eligibility config.
 */
export function calcMinBalance(
  eligibilityType: 'percent' | 'amount',
  eligibilityValue: string,
  totalSupply: bigint,
  decimals: number,
): bigint {
  if (eligibilityType === 'amount') {
    // Raw token amount — multiply by decimals
    const rawAmount = parseFloat(eligibilityValue);
    return BigInt(Math.floor(rawAmount * 10 ** decimals));
  } else {
    // Percentage of total supply
    const pct = parseFloat(eligibilityValue) / 100;
    return BigInt(Math.floor(Number(totalSupply) * pct));
  }
}

/**
 * Find eligible holders given start and end snapshots plus the minimum balance.
 *
 * A holder is eligible iff:
 * - They appear in both snapshots
 * - Their balance in BOTH snapshots >= minBalance
 */
export function getEligibleHolders(
  startSnapshot: HolderBalance[],
  endSnapshot: HolderBalance[],
  minBalance: bigint,
): HolderBalance[] {
  const startMap = new Map<string, bigint>(
    startSnapshot.map((h) => [h.wallet, h.balance]),
  );

  return endSnapshot.filter((h) => {
    if (h.balance < minBalance) return false;
    const startBalance = startMap.get(h.wallet);
    if (startBalance === undefined) return false;
    return startBalance >= minBalance;
  });
}

/**
 * Weighted random selection from eligible holders (proportional to balance).
 * Returns null if the list is empty.
 */
export function weightedRandomHolder(
  eligible: HolderBalance[],
): HolderBalance | null {
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((acc, h) => acc + h.balance, BigInt(0));
  if (totalWeight === BigInt(0)) return null;

  // Use a random float scaled to totalWeight
  const rand = BigInt(
    Math.floor(Math.random() * Number(totalWeight)),
  );

  let cumulative = BigInt(0);
  for (const holder of eligible) {
    cumulative += holder.balance;
    if (rand < cumulative) return holder;
  }

  return eligible[eligible.length - 1];
}
