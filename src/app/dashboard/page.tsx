'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type DrawResponse = {
  ok: boolean;
  error?: string;
  draw?: {
    drawId: string;
    snapshotAt: string;
  };
  winner?: {
    owner: string;
    uiAmount: number;
  };
};

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

type NextDrawSchedule = {
  nextDrawAtIso: string | null;
  countdownMs: number;
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

export default function DashboardPage() {
  const [running, setRunning] = useState(false);
  const [settingRecipient, setSettingRecipient] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextDraw, setNextDraw] = useState<NextDrawSchedule | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [drawResult, setDrawResult] = useState<DrawResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [recipientStatus, setRecipientStatus] = useState('');

  const load = useCallback(async () => {
    const historyResponse = await fetch('/api/proof/history', {
      cache: 'no-store',
    });
    const historyData = await historyResponse.json();

    const nextDrawResponse = await fetch('/api/proof/next-draw', {
      cache: 'no-store',
    });
    const nextDrawData = await nextDrawResponse.json();

    const nextSchedule = nextDrawData.schedule || null;

    setHistory(historyData.history || []);
    setNextDraw(nextSchedule);
    setCountdownMs(nextSchedule?.countdownMs ?? 0);
  }, []);

  useEffect(() => {
    load();

    const refreshInterval = setInterval(() => {
      load();
    }, 15000);

    return () => clearInterval(refreshInterval);
  }, [load]);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setCountdownMs((current) => Math.max(0, current - 1000));
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  async function runDraw() {
    try {
      setRunning(true);
      setRecipientStatus('');

      const res = await fetch('/api/proof/run-draw', {
        method: 'POST',
      });

      const data: DrawResponse = await res.json();
      setDrawResult(data);

      await load();
    } catch (error) {
      console.error('Run draw failed', error);
    } finally {
      setRunning(false);
    }
  }

  async function setWinnerAsFeeRecipient() {
    try {
      setSettingRecipient(true);
      setRecipientStatus('');

      const res = await fetch('/api/proof/set-winner-fee-recipient', {
        method: 'POST',
      });

      const data = await res.json();

      if (data?.ok) {
        setRecipientStatus('Winner set as fee recipient.');
      } else {
        setRecipientStatus(data?.error || 'Fee recipient update failed.');
      }
    } catch (error) {
      console.error('Set fee recipient failed', error);
      setRecipientStatus('Fee recipient update failed.');
    } finally {
      setSettingRecipient(false);
    }
  }

  const latest = history[0];

  const activeWinner = useMemo(() => {
    return drawResult?.winner || latest?.winner || null;
  }, [drawResult, latest]);

  const activeSnapshot = useMemo(() => {
    return drawResult?.draw?.snapshotAt || latest?.snapshotAt || null;
  }, [drawResult, latest]);

  const eligibleCount = latest?.counts?.eligibleCount ?? 0;
  const holderCount = latest?.counts?.holderCountAfterExclusions ?? 0;
  const eligiblePercent =
    holderCount > 0 ? ((eligibleCount / holderCount) * 100).toFixed(2) : '0.00';

  const formattedCountdown = useMemo(() => {
    return formatCountdown(countdownMs);
  }, [countdownMs]);

  async function handleCopy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }

  function WalletRow({ address }: { address: string }) {
    if (!address) {
      return <span className="font-semibold text-white">—</span>;
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={getExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm font-semibold text-white transition hover:text-[var(--accent-soft)] hover:underline"
        >
          {shortenAddress(address)}
        </a>

        <button
          onClick={() => handleCopy(address)}
          className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:border-white/20 hover:text-white"
        >
          {copied === address ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-12 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative rounded-[28px] border border-[var(--border)] bg-[var(--panel-2)] px-8 py-6 shadow-2xl">
              <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-br from-[var(--accent)]/20 via-transparent to-transparent blur-2xl" />

              <img
                src="/dice.png"
                alt="Rando dice logo"
                className="dice-float relative h-20 w-20 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] sm:h-24 sm:w-24"
              />
            </div>
          </div>

          <h1 className="text-6xl font-black tracking-tight text-white sm:text-8xl">
            Rando
          </h1>

          <p className="mx-auto mt-5 max-w-3xl font-mono text-lg leading-8 text-[var(--muted)] sm:text-2xl">
            Live proof dashboard for automated randomized rewards
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={runDraw}
              disabled={running}
              className="inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-6 py-4 font-mono text-lg font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {running ? 'Running Draw…' : 'Run Draw'}
            </button>

            <button
              onClick={setWinnerAsFeeRecipient}
              disabled={settingRecipient || !activeWinner}
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-6 py-4 font-mono text-sm text-[var(--muted)] transition hover:border-white/10 hover:text-white disabled:opacity-50"
            >
              {settingRecipient
                ? 'Setting recipient…'
                : 'Set winner as fee recipient'}
            </button>
          </div>

          {recipientStatus ? (
            <div className="mx-auto mt-4 max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-5 py-3 font-mono text-sm text-[var(--accent-soft)]">
              {recipientStatus}
            </div>
          ) : null}
        </div>

        <div className="rounded-[32px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl sm:p-8">
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
              <div className="font-mono text-sm text-[var(--muted)]">Next Draw</div>
              <div className="mt-3 text-2xl font-black text-white">
                {nextDraw?.nextDrawAtIso ? formatDate(nextDraw.nextDrawAtIso) : '—'}
              </div>
              <div className="mt-2 font-mono text-sm text-[var(--accent-soft)]">
                {formattedCountdown}
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
              <div className="font-mono text-sm text-[var(--muted)]">Eligible Wallets</div>
              <div className="mt-3 text-4xl font-black text-white">
                {formatNumber(eligibleCount)}
              </div>
              <div className="mt-2 font-mono text-sm text-[var(--muted)]">
                Current eligible holders
              </div>
            </div>

            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
              <div className="font-mono text-sm text-[var(--muted)]">Eligibility Rate</div>
              <div className="mt-3 text-4xl font-black text-white">
                {eligiblePercent}%
              </div>
              <div className="mt-2 font-mono text-sm text-[var(--muted)]">
                {formatNumber(holderCount)} tracked holders
              </div>
            </div>
          </div>

          <div className="mb-8 rounded-[28px] border border-[var(--border)] bg-[var(--panel-2)] p-6 sm:p-8">
            <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
              Current Winner
            </div>
            <div className="mb-6 font-mono text-sm text-[var(--muted)]">
              Latest validated winner snapshot
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
                <div className="font-mono text-sm text-[var(--muted)]">Wallet</div>
                <div className="mt-3 min-h-[28px]">
                  {activeWinner ? (
                    <WalletRow address={activeWinner.owner} />
                  ) : (
                    <span className="font-semibold text-white">—</span>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
                <div className="font-mono text-sm text-[var(--muted)]">Balance</div>
                <div className="mt-3 text-4xl font-black text-white">
                  {formatNumber(activeWinner?.uiAmount || 0)}
                </div>
              </div>

              <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-3)] p-5">
                <div className="font-mono text-sm text-[var(--muted)]">Time</div>
                <div className="mt-3 font-mono text-sm text-white">
                  {activeSnapshot ? formatDate(activeSnapshot) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel-2)] p-6 sm:p-8">
            <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
              Recent Draws
            </div>
            <div className="mb-6 font-mono text-sm text-[var(--muted)]">
              Latest 5 winners with live wallet links
            </div>

            <div className="space-y-4">
              {history.slice(0, 5).map((item) => (
                <div
                  key={item.drawId}
                  className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-3)] p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      {item.winner?.owner ? (
                        <WalletRow address={item.winner.owner} />
                      ) : (
                        <span className="font-semibold text-white">—</span>
                      )}

                      <div className="mt-2 font-mono text-sm text-[var(--muted-2)]">
                        {formatDate(item.snapshotAt)}
                      </div>
                    </div>

                    <div className="text-left md:text-right">
                      <div className="text-2xl font-black text-white">
                        {formatNumber(item.winner?.uiAmount || 0)}
                      </div>
                      <div className="mt-1 font-mono text-sm text-[var(--muted)]">
                        winner balance
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {history.length === 0 && (
                <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-3)] p-5 font-mono text-[var(--muted)]">
                  No draws yet
                </div>
              )}
            </div>
          </div>
        </div>
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
            transform: translateY(-8px) rotate(3deg);
          }
          100% {
            transform: translateY(0px) rotate(-3deg);
          }
        }
      `}</style>
    </main>
  );
}