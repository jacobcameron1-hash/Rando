'use client';

import { useEffect, useMemo, useState } from 'react';

type HistoryItem = {
  drawId: string;
  snapshotAt: string;
  winner?: {
    owner: string;
    uiAmount: number;
  };
  counts?: {
    eligibleCount?: number;
    holderCountAfterExclusions?: number;
  };
};

type DisqualificationItem = {
  id: string;
  wallet: string;
  tokenAmount: number;
  reason: string;
  disqualifiedAt: string;
  claimableSolAtCheck: number;
  createdAt?: string | null;
};

type NextDrawSchedule = {
  nextDrawAtIso: string | null;
  countdownMs: number;
};

type DrawResponse = {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  draw?: {
    drawId?: string;
    snapshotAt?: string;
    tokenMint?: string;
    step?: string;
    cycleAction?: string;
  };
  winner?: {
    owner?: string;
    uiAmount?: number;
  };
  counts?: {
    eligibleCount?: number;
    holderCountAfterExclusions?: number;
  };
  proof?: {
    disqualifiedPreviousWinner?: {
      owner?: string;
      validatedUiAmount?: number;
      minimumRequired?: number;
      reason?: string;
      disqualifiedAt?: string;
      claimableSolAtCheck?: number;
    } | null;
    winnerCycle?: {
      activeWinnerWallet?: string | null;
      cycleStartedAt?: string | null;
      cycleCompletedAt?: string | null;
      status?: string;
      minPayoutSol?: number;
      accumulatedSol?: number;
      targetReached?: boolean;
      explanation?: string;
    };
  };
};

type AdminConfigResponse = {
  ok: boolean;
  config?: {
    initialIntervalHours?: number;
    minPayoutSol?: number;
    minTokens?: number;
  };
  winnerCycle?: {
    activeWinnerWallet?: string | null;
    cycleStartedAt?: string | null;
    cycleCompletedAt?: string | null;
    status?: string;
    minPayoutSol?: number;
    accumulatedSol?: number;
    targetReached?: boolean;
    lastDrawId?: string | null;
    lastUpdatedAt?: string | null;
    lastDisqualifiedWinnerWallet?: string | null;
    lastDisqualifiedWinnerAmount?: number;
    lastDisqualifiedAt?: string | null;
    lastDisqualificationReason?: string | null;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSol(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function shortenAddress(address: string) {
  if (!address) return '—';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatCountdown(countdownMs: number) {
  const totalSeconds = Math.max(0, Math.floor(countdownMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function getExplorerUrl(address: string) {
  return `https://solscan.io/account/${address}`;
}

export default function PublicPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [disqualifications, setDisqualifications] = useState<
    DisqualificationItem[]
  >([]);
  const [nextDraw, setNextDraw] = useState<NextDrawSchedule | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [drawResponse, setDrawResponse] = useState<DrawResponse | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [adminConfig, setAdminConfig] = useState<AdminConfigResponse | null>(
    null
  );

  async function load() {
    try {
      const [historyResponse, nextDrawResponse, adminConfigResponse] =
        await Promise.all([
          fetch('/api/proof/history', {
            cache: 'no-store',
          }),
          fetch('/api/proof/next-draw', {
            cache: 'no-store',
          }),
          fetch('/api/proof/admin-config', {
            cache: 'no-store',
          }),
        ]);

      const historyData = await historyResponse.json();
      const nextDrawData = await nextDrawResponse.json();
      const adminConfigData = await adminConfigResponse.json();

      const nextSchedule = nextDrawData.schedule || null;

      setHistory(historyData.history || []);
      setDisqualifications(historyData.disqualifications || []);
      setNextDraw(nextSchedule);
      setCountdownMs(nextSchedule?.countdownMs ?? 0);
      setAdminConfig(adminConfigData || null);
    } catch (error) {
      console.error('Failed to load proof data', error);
    }
  }

  useEffect(() => {
    load();

    const refreshInterval = setInterval(() => {
      load();
    }, 15000);

    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdownMs((current) => Math.max(0, current - 1000));
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  const latest = history[0];

  const formattedCountdown = useMemo(() => {
    return formatCountdown(countdownMs);
  }, [countdownMs]);

  const eligibleCount =
    drawResponse?.counts?.eligibleCount ?? latest?.counts?.eligibleCount ?? 0;

  const holderCount =
    drawResponse?.counts?.holderCountAfterExclusions ??
    latest?.counts?.holderCountAfterExclusions ??
    0;

  const eligiblePercent =
    holderCount > 0 ? ((eligibleCount / holderCount) * 100).toFixed(2) : '0.00';

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }

  function WalletRow({
    address,
    large = false,
  }: {
    address: string;
    large?: boolean;
  }) {
    if (!address) {
      return <span className="font-semibold text-white">—</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={getExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-mono font-semibold text-white hover:text-[#ffd3b2] hover:underline ${
            large ? 'text-lg sm:text-xl' : 'text-base'
          }`}
        >
          {shortenAddress(address)}
        </a>

        <button
          onClick={() => handleCopy(address)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c7a789] transition hover:border-white/20 hover:text-white"
        >
          {copied === address ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  }

  const displayWinnerAddress =
    drawResponse?.winner?.owner ||
    adminConfig?.winnerCycle?.activeWinnerWallet ||
    latest?.winner?.owner ||
    '';

  const displayWinnerAmount =
    drawResponse?.winner?.uiAmount ?? latest?.winner?.uiAmount ?? 0;

  const minPayoutSol =
    adminConfig?.config?.minPayoutSol ??
    adminConfig?.winnerCycle?.minPayoutSol ??
    0.05;

  const minTokens = adminConfig?.config?.minTokens ?? 1000000;
  const drawFrequencyHours = adminConfig?.config?.initialIntervalHours ?? 1;

  const winnerCycle =
    drawResponse?.proof?.winnerCycle || adminConfig?.winnerCycle || null;

  const disqualifiedPreviousWinner =
    drawResponse?.proof?.disqualifiedPreviousWinner ||
    (adminConfig?.winnerCycle?.lastDisqualifiedWinnerWallet
      ? {
          owner: adminConfig.winnerCycle.lastDisqualifiedWinnerWallet,
          validatedUiAmount:
            adminConfig.winnerCycle.lastDisqualifiedWinnerAmount ?? 0,
          minimumRequired: minTokens,
          reason:
            adminConfig.winnerCycle.lastDisqualificationReason ||
            'Dropped below minimum token threshold',
          disqualifiedAt: adminConfig.winnerCycle.lastDisqualifiedAt || '',
          claimableSolAtCheck: 0,
        }
      : null);

  const accumulatedSol = winnerCycle?.accumulatedSol ?? 0;
  const cycleStatus = winnerCycle?.status || 'idle';
  const cycleStartedAt = winnerCycle?.cycleStartedAt || '';
  const cycleEndingAt = nextDraw?.nextDrawAtIso || '';

  return (
    <main className="min-h-screen bg-[#070404] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="relative rounded-[28px] border border-[#4a2519] bg-[#120908] px-6 py-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
              <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(255,88,54,0.25),transparent_60%)]" />
              <div className="pointer-events-none absolute -inset-2 rounded-[32px] bg-[#ff4d2d]/10 blur-xl" />

              <img
                src="/dice.png"
                alt="Rando dice logo"
                className="dice-float relative h-28 w-28 object-contain sm:h-32 sm:w-32"
              />
            </div>
          </div>

          <h1 className="text-5xl font-black tracking-tight text-white sm:text-7xl">
            Rando
          </h1>

          <p className="mx-auto mt-3 max-w-2xl font-mono text-sm leading-6 text-[#bf9b80] sm:text-base">
            Automated randomized rewards for your bags.fm token
          </p>

          <div className="mt-6 font-mono text-sm text-[#b78f73]">
            Live on-chain proof of winner selection and reward routing
          </div>

          <div className="mt-6">
            <a
              href="/try"
              className="inline-flex items-center justify-center rounded-2xl bg-[#e23b28] px-6 py-4 font-mono text-base font-semibold text-white transition hover:bg-[#f04a36]"
            >
              Try it with your coin →
            </a>
          </div>

          {(drawError || drawResponse?.reason) && (
            <div className="mx-auto mt-4 max-w-xl rounded-xl border border-[#4a2519] bg-[#130b09] px-4 py-2 font-mono text-xs text-[#d9b393]">
              {drawError || drawResponse?.reason}
            </div>
          )}
        </section>

        <section className="mb-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-5 flex flex-col gap-4 border-b border-[#2d1a12] pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-3xl font-black text-white sm:text-4xl">
                Current Winner
              </div>
              <div className="mt-2 font-mono text-sm text-[#b78f73]">
                Active winner for the current payout cycle
              </div>
            </div>

            {displayWinnerAddress ? (
              <div className="rounded-full border border-[#4a2519] bg-[#120b09] px-4 py-2 font-mono text-xs text-[#f2cfb0]">
                {cycleStatus === 'active' ? 'Winner cycle active' : 'Latest draw'}
              </div>
            ) : null}
          </div>

          {disqualifiedPreviousWinner && (
            <div className="mb-5 rounded-[24px] border border-[#6a2d1c] bg-[#1a0d09] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-lg font-black text-[#ffd7b8]">
                    Winner Disqualified
                  </div>
                  <div className="mt-2 font-mono text-sm leading-7 text-[#e3b896]">
                    A winner was removed after dropping below the minimum token
                    requirement.
                  </div>
                </div>

                <a
                  href="#disqualifications"
                  className="inline-flex items-center justify-center rounded-full border border-[#6a2d1c] bg-[#120b09] px-4 py-2 font-mono text-sm text-[#ffd7b8] transition hover:border-[#8a3a23] hover:text-white"
                >
                  Show disqualification details
                </a>
              </div>
            </div>
          )}

          {displayWinnerAddress ? (
            <div className="space-y-5">
              <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                <div className="font-mono text-sm text-[#b78f73]">
                  Winning Wallet
                </div>
                <div className="mt-3">
                  <WalletRow address={displayWinnerAddress} large />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">Balance</div>
                  <div className="mt-3 text-2xl font-black text-white sm:text-3xl">
                    {formatNumber(displayWinnerAmount)}
                  </div>
                  <div className="mt-2 font-mono text-sm text-[#d5b190]">
                    winner token balance
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">
                    Accumulated
                  </div>
                  <div className="mt-3 text-2xl font-black text-white sm:text-3xl">
                    {formatSol(accumulatedSol)} SOL
                  </div>
                  <div className="mt-2 font-mono text-sm text-[#d5b190]">
                    {formatSol(minPayoutSol)} SOL minimum before payout
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">
                    Next Cycle Check
                  </div>
                  <div className="mt-3 text-2xl font-black text-white sm:text-3xl">
                    {formattedCountdown}
                  </div>
                  <div className="mt-2 font-mono text-sm text-[#d5b190]">
                    until next draw validation
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">
                    Ending At
                  </div>
                  <div className="mt-3 text-lg font-black leading-tight text-white">
                    {formatDate(cycleEndingAt)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b78f73]">
              No draws yet
            </div>
          )}
        </section>

        <section className="mb-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
            Winner Cycle Status
          </div>
          <div className="mb-6 font-mono text-sm text-[#b78f73]">
            Live status for the active payout cycle
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">Status</div>
              <div className="mt-3 text-2xl font-black text-white">
                {cycleStatus}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Accumulated
              </div>
              <div className="mt-3 text-2xl font-black text-white">
                {formatSol(accumulatedSol)} SOL
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Cycle Started
              </div>
              <div className="mt-3 text-lg font-black leading-tight text-white">
                {formatDate(cycleStartedAt)}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Cycle Ending
              </div>
              <div className="mt-3 text-lg font-black leading-tight text-white">
                {formatDate(cycleEndingAt)}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm leading-7 text-[#d5b190]">
            The winner remains active until payout is ready. If they still meet
            the minimum token requirement at the next cycle check, they keep the
            winning slot.
          </div>
        </section>

        <section className="mb-6 rounded-[32px] border border-[#4a2519] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-2 text-3xl font-black text-white sm:text-4xl">
            How The Proof Works
          </div>
          <div className="mb-6 font-mono text-sm text-[#b78f73]">
            This proof is live and actively running on $RANDO
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Draw Frequency
              </div>
              <div className="mt-3 text-3xl font-black text-white">
                Every {drawFrequencyHours} hour
                {drawFrequencyHours === 1 ? '' : 's'}
              </div>
              <div className="mt-2 font-mono text-sm text-[#d5b190]">
                The live winner is checked again every cycle.
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Minimum Winner Payout
              </div>
              <div className="mt-3 text-3xl font-black text-white">
                {formatSol(minPayoutSol)} SOL
              </div>
              <div className="mt-2 font-mono text-sm text-[#d5b190]">
                The active winner keeps accumulating until payout is ready.
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b78f73]">
                Eligibility Minimum
              </div>
              <div className="mt-3 text-3xl font-black text-white">
                {formatNumber(minTokens)} $RANDO
              </div>
              <div className="mt-2 font-mono text-sm text-[#d5b190]">
                A wallet must stay at or above this balance to remain eligible.
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                  Rule 1
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  A winner is selected for the current live cycle.
                </div>
              </div>

              <div>
                <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                  Rule 2
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  Only wallets holding at least {formatNumber(minTokens)} $RANDO
                  are eligible.
                </div>
              </div>

              <div>
                <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                  Rule 3
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  That winner stays active until payout is ready.
                </div>
              </div>

              <div>
                <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                  Rule 4
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  If the winner drops below {formatNumber(minTokens)} $RANDO at
                  the next cycle check, they are disqualified.
                </div>
              </div>

              <div>
                <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                  Rule 5
                </div>
                <div className="mt-2 text-sm leading-6 text-white">
                  Future fee routing rotates to the next valid winner.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm leading-7 text-[#d5b190]">
            Bags fee routing is the live payout engine for Rando. Winners are
            rotated as fee recipients rather than being paid by manual SOL sends.
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[26px] border border-[#3a2417] bg-[#120b09] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="font-mono text-sm text-[#b78f73]">Next Draw</div>
            <div className="mt-3 text-2xl font-black leading-tight text-white">
              {nextDraw?.nextDrawAtIso ? formatDate(nextDraw.nextDrawAtIso) : '—'}
            </div>
            <div className="mt-2 font-mono text-sm text-[#ffd2ae]">
              {formattedCountdown}
            </div>
          </div>

          <div className="rounded-[26px] border border-[#3a2417] bg-[#120b09] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="font-mono text-sm text-[#b78f73]">
              Eligible Wallets
            </div>
            <div className="mt-3 text-4xl font-black text-white">
              {formatNumber(eligibleCount)}
            </div>
            <div className="mt-2 font-mono text-sm text-[#b78f73]">
              Current eligible holders
            </div>
          </div>

          <div className="rounded-[26px] border border-[#3a2417] bg-[#120b09] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="font-mono text-sm text-[#b78f73]">
              Eligibility Rate
            </div>
            <div className="mt-3 text-4xl font-black text-white">
              {eligiblePercent}%
            </div>
            <div className="mt-2 font-mono text-sm text-[#b78f73]">
              {formatNumber(holderCount)} tracked holders
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
            Recent Draws
          </div>
          <div className="mb-6 font-mono text-sm text-[#b78f73]">
            Latest 5 winners with live wallet links
          </div>

          <div className="space-y-4">
            {history.slice(0, 5).map((item) => (
              <div
                key={item.drawId}
                className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <WalletRow address={item.winner?.owner || ''} />
                    <div className="mt-2 font-mono text-sm text-[#8f755d]">
                      {formatDate(item.snapshotAt)}
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-2xl font-black text-white">
                      {formatNumber(item.winner?.uiAmount || 0)}
                    </div>
                    <div className="mt-1 font-mono text-sm text-[#b78f73]">
                      winner balance
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b78f73]">
                No draws yet
              </div>
            )}
          </div>
        </section>

        <section
          id="disqualifications"
          className="rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8"
        >
          <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
            Disqualifications
          </div>
          <div className="mb-6 font-mono text-sm text-[#b78f73]">
            Latest 3 winner removals from the payout cycle
          </div>

          <div className="space-y-4">
            {disqualifications.map((item) => (
              <div
                key={item.id}
                className="rounded-[24px] border border-[#6a2d1c] bg-[#0f0907] p-5"
              >
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                      Wallet
                    </div>
                    <div className="mt-3">
                      <WalletRow address={item.wallet} />
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                      Token Balance At Check
                    </div>
                    <div className="mt-3 text-2xl font-black text-white">
                      {formatNumber(item.tokenAmount)}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                      Claimable SOL At Check
                    </div>
                    <div className="mt-3 text-2xl font-black text-white">
                      {formatSol(item.claimableSolAtCheck)}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                      Disqualified At
                    </div>
                    <div className="mt-3 text-sm leading-6 text-white">
                      {formatDate(item.disqualifiedAt)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[20px] border border-[#3a2417] bg-[#120b09] p-4">
                  <div className="font-mono text-xs uppercase tracking-wide text-[#b78f73]">
                    Reason
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white">
                    {item.reason}
                  </div>
                </div>
              </div>
            ))}

            {disqualifications.length === 0 && (
              <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b78f73]">
                No recent disqualifications
              </div>
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .dice-float {
          animation: diceFloat 4.5s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes diceFloat {
          0% {
            transform: translateY(0px) rotate(-3deg);
          }
          50% {
            transform: translateY(-10px) rotate(3deg);
          }
          100% {
            transform: translateY(0px) rotate(-3deg);
          }
        }
      `}</style>
    </main>
  );
}