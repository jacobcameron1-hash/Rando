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

export default function PublicPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextDraw, setNextDraw] = useState<NextDrawSchedule | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
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

  const eligibleCount = latest?.counts?.eligibleCount ?? 0;
  const holderCount = latest?.counts?.holderCountAfterExclusions ?? 0;
  const eligiblePercent =
    holderCount > 0 ? ((eligibleCount / holderCount) * 100).toFixed(2) : '0.00';

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
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={getExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-lg font-semibold text-white hover:text-[#f2c9a5] hover:underline"
        >
          {shortenAddress(address)}
        </a>

        <button
          onClick={() => handleCopy(address)}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#b89b7d] transition hover:border-white/20 hover:text-white"
        >
          {copied === address ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#090605] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-12 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative rounded-[32px] border border-[#3a2417] bg-[#120b08] px-10 py-8 shadow-2xl">
              <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-gradient-to-br from-[#ff3b2e]/20 via-transparent to-transparent blur-2xl" />

              <img
                src="/dice.png"
                alt="Rando dice logo"
                className="dice-float relative h-48 w-48 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] sm:h-64 sm:w-64"
              />
            </div>
          </div>

          <h1 className="text-6xl font-black tracking-tight text-white sm:text-8xl">
            Rando
          </h1>

          <p className="mx-auto mt-5 max-w-3xl font-mono text-lg leading-8 text-[#b89b7d] sm:text-2xl">
            Automated randomized rewards for your bags.fm token
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/proof"
              className="inline-flex items-center justify-center rounded-2xl bg-[#e23b28] px-6 py-4 font-mono text-lg font-semibold text-white transition hover:bg-[#f04a36]"
            >
              Open Dashboard →
            </a>

            <div className="inline-flex items-center justify-center rounded-2xl border border-[#3a2417] bg-[#120b08] px-6 py-4 font-mono text-sm text-[#b89b7d]">
              Live proof and recent winners
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-[#3a2417] bg-[#18100c] p-5 shadow-2xl sm:p-8">
          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b89b7d]">Next Draw</div>
              <div className="mt-3 text-2xl font-black text-white">
                {nextDraw?.nextDrawAtIso ? formatDate(nextDraw.nextDrawAtIso) : '—'}
              </div>
              <div className="mt-2 font-mono text-sm text-[#f2c9a5]">
                {formattedCountdown}
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b89b7d]">Eligible Wallets</div>
              <div className="mt-3 text-4xl font-black text-white">
                {formatNumber(eligibleCount)}
              </div>
              <div className="mt-2 font-mono text-sm text-[#b89b7d]">
                Current eligible holders
              </div>
            </div>

            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
              <div className="font-mono text-sm text-[#b89b7d]">Eligibility Rate</div>
              <div className="mt-3 text-4xl font-black text-white">
                {eligiblePercent}%
              </div>
              <div className="mt-2 font-mono text-sm text-[#b89b7d]">
                {formatNumber(holderCount)} tracked holders
              </div>
            </div>
          </div>

          <div className="mb-8 rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
            <div className="mb-2 font-mono text-sm text-[#b89b7d]">Latest Winner</div>

            {latest ? (
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <WalletRow address={latest.winner?.owner || ''} />
                  <div className="mt-4 text-4xl font-black text-white sm:text-5xl">
                    {formatNumber(latest.winner?.uiAmount || 0)}
                  </div>
                  <div className="mt-2 font-mono text-base text-[#f2c9a5]">
                    tokens won
                  </div>
                  <div className="mt-4 font-mono text-sm text-[#8f755d]">
                    {formatDate(latest.snapshotAt)}
                  </div>
                </div>

                <div className="rounded-full bg-[#e23b28] px-5 py-3 text-center font-mono text-sm font-semibold text-white shadow-lg">
                  Most recent winner
                </div>
              </div>
            ) : (
              <div className="mt-2 font-mono text-[#b89b7d]">No draws yet</div>
            )}
          </div>

          <div className="rounded-[28px] border border-[#3a2417] bg-[#120b08] p-6 sm:p-8">
            <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
              Recent Draws
            </div>
            <div className="mb-6 font-mono text-sm text-[#b89b7d]">
              Latest 5 winners with live wallet links
            </div>

            <div className="space-y-4">
              {history.slice(0, 5).map((item) => (
                <div
                  key={item.drawId}
                  className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5"
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
                      <div className="mt-1 font-mono text-sm text-[#b89b7d]">
                        winner balance
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {history.length === 0 && (
                <div className="rounded-[22px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b89b7d]">
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