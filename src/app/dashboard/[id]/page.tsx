'use client';

import { useCallback, useEffect, useState } from 'react';

type WalletEntry = {
  owner: string;
  uiAmount: number;
};

type DrawResponse = {
  ok: boolean;
  error?: string;
  draw?: {
    drawId: string;
    step: string;
    snapshotAt: string;
    tokenMint: string;
  };
  rules?: {
    decimals: number;
    minTokens: number;
    excludedWallets: string[];
  };
  counts?: {
    totalTokenAccounts: number;
    totalHolders: number;
    holderCountAfterExclusions: number;
    thresholdEligibleCount?: number;
    eligibleCount: number;
    excludedWalletCount?: number;
    pagesScanned?: number;
    rerollsDuringValidation?: number;
  };
  winner?: {
    owner: string;
    uiAmount: number;
  };
  proof?: {
    eligibleWalletSample?: WalletEntry[];
    topEligibleSample?: WalletEntry[];
    winnerValidation?: {
      checkedOwner: string;
      validatedUiAmount: number;
      minimumRequired: number;
      passed: boolean;
    };
  };
};

type HistoryItem = {
  drawId: string;
  snapshotAt: string;
  tokenMint?: string;
  winner?: {
    owner: string;
    uiAmount: number;
    winnerIndex?: number;
  };
  counts?: {
    totalTokenAccounts?: number;
    totalHolders?: number;
    holderCountAfterExclusions?: number;
    eligibleCount?: number;
    excludedWalletCount?: number;
    pagesScanned?: number;
  };
};

type HistoryResponse = {
  ok: boolean;
  error?: string;
  history?: HistoryItem[];
};

type NextDrawResponse = {
  ok: boolean;
  error?: string;
  schedule?: {
    enabled: boolean;
    timezone: string;
    nowIso: string;
    firstDrawAtIso: string;
    drawIndex: number;
    currentIntervalHours: number;
    previousDrawAtIso: string | null;
    nextDrawAtIso: string | null;
    countdownMs: number;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function shortenAddress(address: string) {
  if (!address) return '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getCountdownParts(countdownMs: number) {
  const totalSeconds = Math.max(0, Math.floor(countdownMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    minutes,
    seconds,
  };
}

function getEligiblePercent(
  eligibleCount?: number,
  holderCountAfterExclusions?: number
) {
  if (!eligibleCount || !holderCountAfterExclusions) {
    return 0;
  }

  return (eligibleCount / holderCountAfterExclusions) * 100;
}

export default function DashboardPage() {
  const [running, setRunning] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingNextDraw, setLoadingNextDraw] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [drawError, setDrawError] = useState('');
  const [nextDrawError, setNextDrawError] = useState('');
  const [drawResult, setDrawResult] = useState<DrawResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextDraw, setNextDraw] = useState<NextDrawResponse | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError('');

      const res = await fetch('/api/proof/history', {
        cache: 'no-store',
      });

      const data: HistoryResponse = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to load draw history');
      }

      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      console.error('Failed to load history:', error);
      setHistoryError(
        error instanceof Error ? error.message : 'Failed to load draw history'
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadNextDraw = useCallback(async () => {
    try {
      setLoadingNextDraw(true);
      setNextDrawError('');

      const res = await fetch('/api/proof/next-draw', {
        cache: 'no-store',
      });

      const data: NextDrawResponse = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Failed to load next draw time');
      }

      setNextDraw(data);
    } catch (error) {
      console.error('Failed to load next draw:', error);
      setNextDrawError(
        error instanceof Error ? error.message : 'Failed to load next draw time'
      );
    } finally {
      setLoadingNextDraw(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    loadNextDraw();
  }, [loadHistory, loadNextDraw]);

  async function runDraw() {
    try {
      setRunning(true);
      setDrawError('');
      setDrawResult(null);

      const res = await fetch('/api/proof/run-draw', {
        method: 'POST',
      });

      const data: DrawResponse = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Draw failed');
      }

      setDrawResult(data);
      await loadHistory();
      await loadNextDraw();
    } catch (error) {
      console.error('Run draw failed:', error);
      setDrawError(error instanceof Error ? error.message : 'Draw failed');
      await loadNextDraw();
    } finally {
      setRunning(false);
    }
  }

  const countdown = getCountdownParts(nextDraw?.schedule?.countdownMs ?? 0);
  const eligibilitySource = drawResult?.counts ?? history[0]?.counts;

  return (
    <main className="min-h-screen bg-[#090605] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-10 text-center">
          <div className="mb-3 text-4xl">🎲</div>
          <h1 className="text-5xl font-black tracking-tight text-white sm:text-7xl">
            Rando Dashboard
          </h1>
          <p className="mx-auto mt-4 max-w-3xl font-mono text-lg leading-8 text-[#b89b7d] sm:text-2xl">
            Live proof draw dashboard using the real API routes
          </p>
        </div>

        <div className="rounded-[32px] border border-[#3a2417] bg-[#18100c] p-5 shadow-2xl sm:p-8">
          <div className="mb-8 rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">Next Draw</h2>
                <p className="mt-1 font-mono text-sm text-[#b89b7d]">
                  Live status from /api/proof/next-draw
                </p>
              </div>

              <button
                onClick={loadNextDraw}
                disabled={loadingNextDraw}
                className="rounded-2xl border border-[#3a2417] bg-[#0f0907] px-4 py-2 font-mono text-sm font-semibold text-white transition hover:border-white/20 disabled:opacity-50"
              >
                {loadingNextDraw ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm">
              {nextDrawError ? (
                <div className="text-red-300">{nextDrawError}</div>
              ) : loadingNextDraw ? (
                <div className="text-[#b89b7d]">Loading next draw…</div>
              ) : nextDraw?.schedule ? (
                <div className="space-y-3">
                  <div>
                    <span className="text-[#b89b7d]">Next Draw At:</span>{' '}
                    <span className="text-white">
                      {nextDraw.schedule.nextDrawAtIso
                        ? formatDate(nextDraw.schedule.nextDrawAtIso)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#b89b7d]">Minutes Until Draw:</span>{' '}
                    <span className="text-white">{countdown.minutes}</span>
                  </div>
                  <div>
                    <span className="text-[#b89b7d]">Seconds Until Draw:</span>{' '}
                    <span className="text-white">{countdown.seconds}</span>
                  </div>
                </div>
              ) : (
                <div className="text-[#b89b7d]">No next draw data available.</div>
              )}
            </div>
          </div>

          <div className="mb-8 rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
            <div>
              <h2 className="text-3xl font-black text-white">Eligibility</h2>
              <p className="mt-1 font-mono text-sm text-[#b89b7d]">
                Simple live snapshot based on the latest draw data
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                <div className="font-mono text-sm text-[#b89b7d]">Eligible Wallets</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {eligibilitySource?.eligibleCount ?? '—'}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                <div className="font-mono text-sm text-[#b89b7d]">Tracked Holders</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {eligibilitySource?.holderCountAfterExclusions ?? '—'}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                <div className="font-mono text-sm text-[#b89b7d]">Eligible %</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {formatNumber(
                    getEligiblePercent(
                      eligibilitySource?.eligibleCount,
                      eligibilitySource?.holderCountAfterExclusions
                    )
                  )}
                  %
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black text-white">Run Draw</h2>
                  <p className="mt-1 font-mono text-sm text-[#b89b7d]">
                    Triggers the real draw route at /api/proof/run-draw
                  </p>
                </div>
                <button
                  onClick={runDraw}
                  disabled={running}
                  className="rounded-2xl bg-[#e23b28] px-5 py-3 font-mono text-sm font-semibold text-white transition hover:bg-[#f04a36] disabled:opacity-50"
                >
                  {running ? 'Running…' : 'Run Real Draw'}
                </button>
              </div>

              {drawError ? (
                <div className="mb-4 rounded-[22px] border border-yellow-500/30 bg-yellow-500/10 p-4 font-mono text-sm text-yellow-200">
                  {drawError}
                </div>
              ) : null}

              {drawResult ? (
                <div className="space-y-4">
                  <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                    <div className="mb-3 font-mono text-sm text-[#b89b7d]">
                      Latest Result
                    </div>
                    <div className="space-y-3 font-mono text-sm">
                      <div>
                        <span className="text-[#b89b7d]">Draw ID:</span>{' '}
                        <span className="break-all text-white">
                          {drawResult.draw?.drawId}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Snapshot:</span>{' '}
                        <span className="text-white">
                          {drawResult.draw?.snapshotAt
                            ? formatDate(drawResult.draw.snapshotAt)
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Step:</span>{' '}
                        <span className="text-white">
                          {drawResult.draw?.step || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Winner:</span>{' '}
                        <span className="text-white">
                          {drawResult.winner?.owner
                            ? `${shortenAddress(drawResult.winner.owner)} (${formatNumber(
                                drawResult.winner.uiAmount
                              )})`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Eligible Count:</span>{' '}
                        <span className="text-white">
                          {drawResult.counts?.eligibleCount ?? '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Validation Re-rolls:</span>{' '}
                        <span className="text-white">
                          {drawResult.counts?.rerollsDuringValidation ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Validated Winner Balance:</span>{' '}
                        <span className="text-white">
                          {drawResult.proof?.winnerValidation?.validatedUiAmount != null
                            ? formatNumber(
                                drawResult.proof.winnerValidation.validatedUiAmount
                              )
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#b89b7d]">Minimum Required:</span>{' '}
                        <span className="text-white">
                          {drawResult.proof?.winnerValidation?.minimumRequired != null
                            ? formatNumber(
                                drawResult.proof.winnerValidation.minimumRequired
                              )
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                      <div className="mb-3 font-mono text-sm text-[#b89b7d]">
                        Eligible Wallet Sample
                      </div>
                      <div className="space-y-2 font-mono text-sm">
                        {drawResult.proof?.eligibleWalletSample?.length ? (
                          drawResult.proof.eligibleWalletSample.map((wallet) => (
                            <div
                              key={`${wallet.owner}-eligible`}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="text-white">
                                {shortenAddress(wallet.owner)}
                              </span>
                              <span className="text-[#b89b7d]">
                                {formatNumber(wallet.uiAmount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[#8f755d]">No sample available</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5">
                      <div className="mb-3 font-mono text-sm text-[#b89b7d]">
                        Top Eligible Sample
                      </div>
                      <div className="space-y-2 font-mono text-sm">
                        {drawResult.proof?.topEligibleSample?.length ? (
                          drawResult.proof.topEligibleSample.map((wallet) => (
                            <div
                              key={`${wallet.owner}-top`}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="text-white">
                                {shortenAddress(wallet.owner)}
                              </span>
                              <span className="text-[#b89b7d]">
                                {formatNumber(wallet.uiAmount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[#8f755d]">No sample available</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm text-[#b89b7d]">
                  No draw has been run in this session yet.
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black text-white">Draw History</h2>
                  <p className="mt-1 font-mono text-sm text-[#b89b7d]">
                    Real history from /api/proof/history
                  </p>
                </div>
                <button
                  onClick={loadHistory}
                  disabled={loadingHistory}
                  className="rounded-2xl border border-[#3a2417] bg-[#0f0907] px-4 py-2 font-mono text-sm font-semibold text-white transition hover:border-white/20 disabled:opacity-50"
                >
                  {loadingHistory ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {historyError ? (
                <div className="mb-4 rounded-[22px] border border-red-500/30 bg-red-500/10 p-4 font-mono text-sm text-red-300">
                  {historyError}
                </div>
              ) : null}

              {loadingHistory ? (
                <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm text-[#b89b7d]">
                  Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-sm text-[#b89b7d]">
                  No draw history found yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div
                      key={item.drawId}
                      className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="font-mono text-sm font-semibold text-white">
                          {item.drawId}
                        </div>
                        <div className="font-mono text-xs text-[#8f755d]">
                          {formatDate(item.snapshotAt)}
                        </div>
                      </div>

                      <div className="grid gap-2 font-mono text-sm">
                        <div>
                          <span className="text-[#b89b7d]">Winner:</span>{' '}
                          <span className="text-white">
                            {item.winner?.owner
                              ? shortenAddress(item.winner.owner)
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#b89b7d]">Winner Balance:</span>{' '}
                          <span className="text-white">
                            {item.winner?.uiAmount != null
                              ? formatNumber(item.winner.uiAmount)
                              : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#b89b7d]">Eligible Count:</span>{' '}
                          <span className="text-white">
                            {item.counts?.eligibleCount ?? '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}