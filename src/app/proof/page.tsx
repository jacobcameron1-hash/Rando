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

type DrawRecipient = {
  role?: string;
  wallet?: string;
  percent?: number;
  bps?: number;
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
  };
  winner?: {
    owner?: string;
    uiAmount?: number;
  };
  counts?: {
    eligibleCount?: number;
    holderCountAfterExclusions?: number;
  };
  payout?: {
    configUpdated?: boolean;
    transactionSignature?: string;
    recipients?: DrawRecipient[];
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
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

function getTxExplorerUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

export default function PublicPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [nextDraw, setNextDraw] = useState<NextDrawSchedule | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [drawResponse, setDrawResponse] = useState<DrawResponse | null>(null);
  const [isRunningDraw, setIsRunningDraw] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  async function load() {
    try {
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
    drawResponse?.counts?.eligibleCount ??
    latest?.counts?.eligibleCount ??
    0;

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

  async function handleRunDraw() {
    try {
      setIsRunningDraw(true);
      setDrawError(null);

      const response = await fetch('/api/proof/run-draw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setDrawResponse(data);
        setDrawError(data.error || 'Failed to run draw');
        return;
      }

      setDrawResponse(data);
      await load();
    } catch (error) {
      console.error('Failed to run draw', error);
      setDrawError('Failed to run draw');
    } finally {
      setIsRunningDraw(false);
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
    drawResponse?.winner?.owner || latest?.winner?.owner || '';

  const displayWinnerAmount =
    drawResponse?.winner?.uiAmount ?? latest?.winner?.uiAmount ?? 0;

  const displayWinnerTime =
    drawResponse?.draw?.snapshotAt || latest?.snapshotAt || '';

  const payoutRecipients = drawResponse?.payout?.recipients || [];
  const txSignature = drawResponse?.payout?.transactionSignature || '';

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

  <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
    <a
      href="/dashboard"
      className="inline-flex min-w-[200px] items-center justify-center rounded-2xl bg-[#df3f29] px-5 py-3 font-mono text-sm font-semibold text-white transition hover:bg-[#f04d36]"
    >
      Open Dashboard
    </a>

    <button
      onClick={handleRunDraw}
      disabled={isRunningDraw}
      className="inline-flex min-w-[200px] items-center justify-center rounded-2xl border border-[#4a2519] bg-[#18100d] px-5 py-3 font-mono text-sm font-semibold text-[#f6d1b0] transition hover:border-[#6a3526] hover:text-white disabled:opacity-60"
    >
      {isRunningDraw ? 'Running...' : 'Run Draw'}
    </button>
  </div>

  {(drawError || drawResponse?.reason) && (
    <div className="mx-auto mt-4 max-w-xl rounded-xl border border-[#4a2519] bg-[#130b09] px-4 py-2 font-mono text-xs text-[#d9b393]">
      {drawError || drawResponse?.reason}
    </div>
  )}
</section>

        <section className="grid gap-4 md:grid-cols-3">
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
            <div className="font-mono text-sm text-[#b78f73]">Eligible Wallets</div>
            <div className="mt-3 text-4xl font-black text-white">
              {formatNumber(eligibleCount)}
            </div>
            <div className="mt-2 font-mono text-sm text-[#b78f73]">
              Current eligible holders
            </div>
          </div>

          <div className="rounded-[26px] border border-[#3a2417] bg-[#120b09] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="font-mono text-sm text-[#b78f73]">Eligibility Rate</div>
            <div className="mt-3 text-4xl font-black text-white">
              {eligiblePercent}%
            </div>
            <div className="mt-2 font-mono text-sm text-[#b78f73]">
              {formatNumber(holderCount)} tracked holders
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-6 text-3xl font-black text-white sm:text-4xl">
            Current Winner
          </div>

          {displayWinnerAddress ? (
            <>
              <div className="mb-6">
                <WalletRow address={displayWinnerAddress} large />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">Wallet</div>
                  <div className="mt-3 text-2xl font-black text-white">
                    {shortenAddress(displayWinnerAddress)}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">Balance</div>
                  <div className="mt-3 text-2xl font-black text-white">
                    {formatNumber(displayWinnerAmount)}
                  </div>
                  <div className="mt-2 font-mono text-sm text-[#d5b190]">
                    winner balance
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">Draw Time</div>
                  <div className="mt-3 text-lg font-black leading-tight text-white">
                    {formatDate(displayWinnerTime)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b78f73]">
              No draws yet
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="mb-1 text-3xl font-black text-white sm:text-4xl">
            Live Reward Routing
          </div>
          <div className="mb-6 font-mono text-sm text-[#b78f73]">
            Latest manual draw result and Bags recipient update
          </div>

          {drawResponse ? (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="font-mono text-sm text-[#b78f73]">Status</div>
                    <div className="mt-2 text-xl font-black text-white">
                      {drawResponse.ok
                        ? drawResponse.skipped
                          ? 'Skipped'
                          : 'Success'
                        : 'Failed'}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-sm text-[#b78f73]">Step</div>
                    <div className="mt-2 text-sm font-mono text-[#f2cfb0]">
                      {drawResponse.draw?.step || drawResponse.reason || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-sm text-[#b78f73]">
                      Config Updated
                    </div>
                    <div className="mt-2 text-xl font-black text-white">
                      {drawResponse.payout?.configUpdated ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>
              </div>

              {payoutRecipients.length > 0 && (
                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="mb-4 text-xl font-black text-white">
                    Recipients
                  </div>

                  <div className="space-y-3">
                    {payoutRecipients.map((recipient, index) => (
                      <div
                        key={`${recipient.wallet || 'wallet'}-${index}`}
                        className="rounded-[20px] border border-[#2f1d13] bg-[#120b09] p-4"
                      >
                        <div className="grid gap-3 md:grid-cols-[140px_1fr_120px] md:items-center">
                          <div className="font-mono text-sm uppercase tracking-wide text-[#b78f73]">
                            {recipient.role || `Recipient ${index + 1}`}
                          </div>

                          <div>
                            {recipient.wallet ? (
                              <WalletRow address={recipient.wallet} />
                            ) : (
                              <div className="font-mono text-sm text-[#b78f73]">—</div>
                            )}
                          </div>

                          <div className="text-left md:text-right">
                            <div className="text-xl font-black text-white">
                              {recipient.percent ??
                                (typeof recipient.bps === 'number'
                                  ? recipient.bps / 100
                                  : 0)}
                              %
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {txSignature && (
                <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5">
                  <div className="font-mono text-sm text-[#b78f73]">
                    Transaction Signature
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={getTxExplorerUrl(txSignature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-semibold text-white hover:text-[#ffd3b2] hover:underline"
                    >
                      {shortenAddress(txSignature)}
                    </a>

                    <button
                      onClick={() => handleCopy(txSignature)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#c7a789] transition hover:border-white/20 hover:text-white"
                    >
                      {copied === txSignature ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] border border-[#3a2417] bg-[#0f0907] p-5 font-mono text-[#b78f73]">
              Run a manual draw to show the latest live Bags routing update here.
            </div>
          )}
        </section>

        <section className="mt-6 rounded-[32px] border border-[#3a2417] bg-[#18100c] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.42)] sm:p-8">
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