const BAGS_API_KEY = process.env.BAGS_API_KEY!;
const BAGS_BASE_URL =
  process.env.BAGS_BASE_URL || 'https://public-api-v2.bags.fm/api/v1';
const TOKEN_MINT = 'EZthQ6SUL51jJihQiFMDiZVmZiRMNjMQoTb7rNvTBAGS';
const DEV_WALLET = process.env.RANDO_DEV_WALLET!;

export type BagsClaimEvent = {
  wallet: string;
  isCreator: boolean;
  amount: string;
  signature: string;
  timestamp: string;
};

export type WinnerClaimEvent = {
  wallet: string;
  amountSol: number;
  signature: string;
  timestamp: string;
};

async function fetchClaimEventsPage(offset: number): Promise<BagsClaimEvent[]> {
  const url = new URL(`${BAGS_BASE_URL}/fee-share/token/claim-events`);
  url.searchParams.set('tokenMint', TOKEN_MINT);
  url.searchParams.set('mode', 'offset');
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    headers: { 'x-api-key': BAGS_API_KEY },
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Failed to fetch Bags claim events');
  }

  return json.response?.events ?? [];
}

export async function getAllWinnerClaimEvents(): Promise<WinnerClaimEvent[]> {
  const allEvents: BagsClaimEvent[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchClaimEventsPage(offset);
    allEvents.push(...page);

    if (page.length < 100) break;
    offset += 100;
  }

  // Filter out the dev wallet — only keep winner payouts
  return allEvents
    .filter((e) => !e.isCreator && e.wallet !== DEV_WALLET)
    .map((e) => ({
      wallet: e.wallet,
      amountSol: Number(e.amount) / 1_000_000_000,
      signature: e.signature,
      timestamp: e.timestamp,
    }));
}

export async function getTotalWinnerPayoutSol(): Promise<number> {
  const events = await getAllWinnerClaimEvents();
  return events.reduce((sum, e) => sum + e.amountSol, 0);
}

export function findClaimForCycle(
  claimEvents: WinnerClaimEvent[],
  winnerWallet: string,
  cycleStartedAt: string | null
): WinnerClaimEvent | null {
  if (!winnerWallet || !cycleStartedAt) return null;

  const cycleStart = new Date(cycleStartedAt).getTime();
  // Look back 48 hours before the cycle start to catch claims
  // that Bags processed around the same time as the draw
  const lookbackMs = 48 * 60 * 60 * 1000;

  const matches = claimEvents
    .filter(
      (e) =>
        e.wallet === winnerWallet &&
        new Date(e.timestamp).getTime() >= cycleStart - lookbackMs
    )
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  return matches[0] ?? null;
}