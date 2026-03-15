/**
 * Lottery winner selection via rejection sampling.
 *
 * Algorithm:
 * 1. Pick a random weighted holder from the eligible set
 * 2. They are already filtered for hold duration (both snapshots) and min balance
 * 3. If eligible pool is empty, pot rolls over
 * 4. Repeat up to MAX_ATTEMPTS picks (safety valve)
 * 5. If MAX_ATTEMPTS exhausted without a winner, pot rolls over
 *
 * Since eligibility is pre-filtered before calling selectWinner, each pick
 * from the eligible set is guaranteed eligible. The MAX_ATTEMPTS cap is a
 * safety valve in case of edge cases (e.g., concurrent balance changes).
 */

import { HolderBalance, weightedRandomHolder } from './holders';

export const MAX_ATTEMPTS = 10;

export interface LotteryResult {
  winner: string | null;      // wallet address, or null if rollover
  rolledOver: boolean;
  attempts: number;
}

/**
 * Select a winner from the pre-filtered eligible holder list.
 * eligible: holders who passed both snapshot and min-balance checks.
 */
export function selectWinner(eligible: HolderBalance[]): LotteryResult {
  if (eligible.length === 0) {
    return { winner: null, rolledOver: true, attempts: 0 };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const picked = weightedRandomHolder(eligible);
    if (picked) {
      return { winner: picked.wallet, rolledOver: false, attempts: attempt };
    }
  }

  return { winner: null, rolledOver: true, attempts: MAX_ATTEMPTS };
}
