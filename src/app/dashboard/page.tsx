'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  counts?: {
    holderCountAfterExclusions: number;
    eligibleCount: number;
    rerollsDuringValidation?: number;
  };
  winner?: {
    owner: string;
    uiAmount: number;
  };
  proof?: {
    winnerValidation?: {
      validatedUiAmount: number;
      minimumRequired: number;
      passed: boolean;
    };
    eligibleWalletSample?: WalletEntry[];
    topEligibleSample?: WalletEntry[];
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
  };
};

type FeeRecipientResponse = {
  ok: boolean;
  error?: string;
  mode?: 'preview' | 'live';
  winner?: {
    drawId: string;
    snapshotAt: string;
    tokenMint: string;
    owner: string;
    uiAmount: number;
  };
  payload?: {
    baseMint: string;
    payer: string;
    basisPointsArray: number[];
    claimersArray: string[];
  };
  bagsRawResponse?: string;
  status?: number;
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
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function DashboardPage() {
  const [running, setRunning] = useState(false);
  const [settingRecipient, setSettingRecipient] = useState(false);
  const [drawResult, setDrawResult] = useState<DrawResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [feeRecipientResult, setFeeRecipientResult] =
    useState<FeeRecipientResponse | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/proof/history', { cache: 'no-store' });
    const data = await res.json();

    if (data?.ok) {
      setHistory(data.history || []);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function runDraw() {
    setRunning(true);
    setFeeRecipientResult(null);

    try {
      const res = await fetch('/api/proof/run-draw', { method: 'POST' });
      const data = await res.json();

      if (data?.ok) {
        setDrawResult(data);
        await loadHistory();
      } else {
        setDrawResult(data);
      }
    } finally {
      setRunning(false);
    }
  }

  async function setWinnerAsFeeRecipient() {
    setSettingRecipient(true);
    setFeeRecipientResult(null);

    try {
      const res = await fetch('/api/proof/set-winner-fee-recipient', {
        method: 'POST',
      });

      const data: FeeRecipientResponse = await res.json();
      setFeeRecipientResult(data);
    } finally {
      setSettingRecipient(false);
    }
  }

  const activeWinner = useMemo(() => {
    if (drawResult?.winner) return drawResult.winner;
    if (history[0]?.winner) return history[0].winner;
    return null;
  }, [drawResult, history]);

  const feeRecipientStatusText = useMemo(() => {
    if (settingRecipient) return 'Updating Bags fee recipient...';
    if (!feeRecipientResult) return 'No fee recipient update sent yet.';
    if (feeRecipientResult.ok) {
      return 'Winner was successfully set as fee recipient.';
    }
    return feeRecipientResult.error || 'Fee recipient update failed.';
  }, [settingRecipient, feeRecipientResult]);

  return (
    <main className="min-h-screen bg-[#090605] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10 text-center">
          <div className="mb-3 text-5xl">🎲</div>
          <h1 className="text-6xl font-black">Rando Fee Share</h1>
          <p className="mt-4 font-mono text-[#b89b7d]">
            Random holder becomes the active fee recipient. Bags distributes
            rewards automatically.
          </p>
        </div>

        <div className="mb-8 rounded-3xl border border-[#3a2417] bg-[#18100c] p-8">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <div className="text-sm text-[#8f755d] font-mono uppercase">
                Active Recipient
              </div>
              <h2 className="text-3xl font-black mt-2">Current Winner</h2>
            </div>

            <div className="flex gap-3">
              <button
                onClick={runDraw}
                disabled={running}
                className="bg-[#e23b28] px-6 py-3 rounded-xl font-mono disabled:opacity-50"
              >
                {running ? 'Running…' : 'Run Draw'}
              </button>

              <button
                onClick={setWinnerAsFeeRecipient}
                disabled={settingRecipient}
                className="bg-blue-600 px-6 py-3 rounded-xl font-mono disabled:opacity-50"
              >
                {settingRecipient
                  ? 'Setting Recipient…'
                  : 'Set Winner as Fee Recipient'}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-[#120b08] p-5 rounded-xl">
              <div className="text-sm text-[#b89b7d]">Wallet</div>
              <div className="text-xl mt-2">
                {activeWinner ? shortenAddress(activeWinner.owner) : '—'}
              </div>
            </div>

            <div className="bg-[#120b08] p-5 rounded-xl">
              <div className="text-sm text-[#b89b7d]">Balance</div>
              <div className="text-xl mt-2">
                {activeWinner ? formatNumber(activeWinner.uiAmount) : '—'}
              </div>
            </div>

            <div className="bg-[#120b08] p-5 rounded-xl">
              <div className="text-sm text-[#b89b7d]">Status</div>
              <div className="text-xl mt-2">
                {drawResult?.proof?.winnerValidation?.passed
                  ? 'Validated'
                  : activeWinner
                    ? 'Selected'
                    : 'Waiting'}
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-[#3a2417] bg-[#18100c] p-6">
          <h2 className="mb-4 text-2xl font-black">Fee Recipient Update</h2>

          <div className="rounded-xl bg-[#120b08] p-5">
            <div className="mb-3 text-sm text-[#b89b7d]">Result</div>
            <div className="font-mono text-sm">{feeRecipientStatusText}</div>

            {feeRecipientResult?.winner ? (
              <div className="mt-4 grid gap-2 font-mono text-sm">
                <div>
                  Winner Wallet:{' '}
                  <span className="text-[#b89b7d]">
                    {feeRecipientResult.winner.owner}
                  </span>
                </div>
                <div>
                  Snapshot:{' '}
                  <span className="text-[#b89b7d]">
                    {formatDate(feeRecipientResult.winner.snapshotAt)}
                  </span>
                </div>
                <div>
                  Mode:{' '}
                  <span className="text-[#b89b7d]">
                    {feeRecipientResult.mode || '—'}
                  </span>
                </div>
                <div>
                  HTTP Status:{' '}
                  <span className="text-[#b89b7d]">
                    {feeRecipientResult.status ?? '—'}
                  </span>
                </div>
              </div>
            ) : null}

            {feeRecipientResult?.ok ? (
              <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 font-mono text-sm text-green-200">
                Bags accepted the winner update.
              </div>
            ) : null}

            {!feeRecipientResult?.ok && feeRecipientResult?.bagsRawResponse ? (
              <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 font-mono text-xs text-yellow-200 break-all">
                {feeRecipientResult.bagsRawResponse}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-[#3a2417] bg-[#18100c] p-6">
          <h2 className="text-2xl font-black mb-4">Last Draw</h2>

          {drawResult ? (
            <div className="font-mono text-sm space-y-2">
              <div>Draw ID: {drawResult.draw?.drawId}</div>
              <div>
                Snapshot:{' '}
                {drawResult.draw?.snapshotAt
                  ? formatDate(drawResult.draw.snapshotAt)
                  : '—'}
              </div>
              <div>
                Eligible Count: {drawResult.counts?.eligibleCount}
              </div>
              <div>
                Re-rolls: {drawResult.counts?.rerollsDuringValidation ?? 0}
              </div>
              <div>
                Validated Balance:{' '}
                {drawResult.proof?.winnerValidation?.validatedUiAmount
                  ? formatNumber(
                      drawResult.proof.winnerValidation.validatedUiAmount
                    )
                  : '—'}
              </div>
            </div>
          ) : (
            <div className="text-[#8f755d] font-mono">
              No draw yet
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-[#3a2417] bg-[#18100c] p-6">
          <h2 className="text-2xl font-black mb-4">History</h2>

          {history.length === 0 ? (
            <div className="text-[#8f755d] font-mono">
              No history yet
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  key={item.drawId}
                  className="bg-[#120b08] p-4 rounded-xl"
                >
                  <div className="flex justify-between text-sm font-mono">
                    <div>{item.drawId}</div>
                    <div>{formatDate(item.snapshotAt)}</div>
                  </div>

                  <div className="mt-2 text-sm">
                    Winner:{' '}
                    {item.winner?.owner
                      ? shortenAddress(item.winner.owner)
                      : '—'}
                  </div>

                  <div className="text-sm">
                    Balance:{' '}
                    {item.winner?.uiAmount
                      ? formatNumber(item.winner.uiAmount)
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}