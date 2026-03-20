'use client';

import { useEffect, useMemo, useState } from 'react';

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
    eligibleCount: number;
    excludedWalletCount?: number;
    pagesScanned?: number;
  };
  winner?: {
    owner: string;
    uiAmount: number;
  };
  proof?: {
    eligibleWalletSample: WalletEntry[];
    topEligibleSample: WalletEntry[];
  };
};

type HistoryApiResponse = {
  ok: boolean;
  error?: string;
  history?: Array<{
    drawId: string;
    snapshotAt: string;
    tokenMint: string;
    winner: {
      owner: string;
      uiAmount: number;
      winnerIndex: number;
    };
    counts: {
      totalTokenAccounts: number;
      totalHolders: number;
      holderCountAfterExclusions: number;
      eligibleCount: number;
      excludedWalletCount: number;
      pagesScanned: number;
    };
  }>;
};

type DrawHistoryItem = {
  drawId: string;
  snapshotAt: string;
  winnerOwner: string;
  winnerAmount: number;
  eligibleCount?: number;
};

type NextDrawApiResponse = {
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
    nextDrawAtIso: string;
    countdownMs: number;
  };
};

type NextDrawState = {
  enabled: boolean;
  timezone: string;
  nowIso: string;
  firstDrawAtIso: string;
  drawIndex: number;
  currentIntervalHours: number;
  previousDrawAtIso: string | null;
  nextDrawAtIso: string;
  countdownMs: number;
};

function formatNumber(value: number | undefined) {
  if (typeof value !== 'number') return '-';

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatDate(value: string | undefined) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function shortWallet(wallet: string | undefined) {
  if (!wallet) return '-';
  if (wallet.length <= 12) return wallet;

  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}

function getSolscanAddressUrl(address: string) {
  return `https://solscan.io/account/${address}`;
}

function getSolscanTokenUrl(mint: string) {
  return `https://solscan.io/token/${mint}`;
}

function mapHistoryResponseToItems(
  history: HistoryApiResponse['history']
): DrawHistoryItem[] {
  if (!history || history.length === 0) {
    return [];
  }

  return history.map((item) => ({
    drawId: item.drawId,
    snapshotAt: item.snapshotAt,
    winnerOwner: item.winner.owner,
    winnerAmount: item.winner.uiAmount,
    eligibleCount: item.counts.eligibleCount,
  }));
}

function formatCountdownParts(totalMs: number) {
  const safeMs = Math.max(totalMs, 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
  };
}

function formatCountdownLabel(totalMs: number) {
  const parts = formatCountdownParts(totalMs);

  return `${String(parts.days).padStart(2, '0')}d ${String(
    parts.hours
  ).padStart(2, '0')}h ${String(parts.minutes).padStart(2, '0')}m ${String(
    parts.seconds
  ).padStart(2, '0')}s`;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        background: '#ffffff',
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: '#6b7280',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: '#111827',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid #d1d5db',
        background: '#ffffff',
        color: '#111827',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function WalletActions({
  wallet,
  onCopy,
}: {
  wallet: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
      }}
    >
      <ActionButton
        label="Copy"
        onClick={() => onCopy(wallet, 'Wallet copied')}
      />
      <a
        href={getSolscanAddressUrl(wallet)}
        target="_blank"
        rel="noreferrer"
        style={{
          border: '1px solid #d1d5db',
          background: '#ffffff',
          color: '#111827',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        View on Solscan
      </a>
    </div>
  );
}

function WalletList({
  items,
  emptyText,
  winnerWallet,
  onCopy,
}: {
  items: WalletEntry[] | undefined;
  emptyText: string;
  winnerWallet?: string;
  onCopy: (text: string, label: string) => void;
}) {
  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          background: '#ffffff',
          color: '#6b7280',
        }}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {items.map((wallet, index) => {
        const isWinner = wallet.owner === winnerWallet;

        return (
          <div
            key={`${wallet.owner}-${index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              padding: 14,
              borderBottom:
                index === items.length - 1 ? 'none' : '1px solid #f3f4f6',
              background: isWinner ? '#fefce8' : '#ffffff',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#111827',
                    wordBreak: 'break-all',
                  }}
                  title={wallet.owner}
                >
                  {shortWallet(wallet.owner)}
                </div>

                {isWinner && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#92400e',
                      background: '#fef3c7',
                      border: '1px solid #fcd34d',
                      borderRadius: 999,
                      padding: '2px 8px',
                    }}
                  >
                    WINNER
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  wordBreak: 'break-all',
                }}
              >
                {wallet.owner}
              </div>

              <WalletActions wallet={wallet.owner} onCopy={onCopy} />
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#111827',
                whiteSpace: 'nowrap',
                alignSelf: 'start',
              }}
            >
              {formatNumber(wallet.uiAmount)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({
  items,
  onCopy,
}: {
  items: DrawHistoryItem[];
  onCopy: (text: string, label: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: 16,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          background: '#ffffff',
          color: '#6b7280',
        }}
      >
        No draws yet. Run the draw to start building history.
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {items.map((item, index) => (
        <div
          key={`${item.drawId}-${index}`}
          style={{
            padding: 16,
            borderBottom:
              index === items.length - 1 ? 'none' : '1px solid #f3f4f6',
            background: index === 0 ? '#f9fafb' : '#ffffff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#111827',
                  marginBottom: 4,
                }}
              >
                {shortWallet(item.winnerOwner)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#6b7280',
                  wordBreak: 'break-all',
                }}
              >
                {item.winnerOwner}
              </div>
            </div>

            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#111827',
                whiteSpace: 'nowrap',
              }}
            >
              {formatNumber(item.winnerAmount)}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gap: 6,
              fontSize: 13,
              color: '#4b5563',
              marginBottom: 12,
            }}
          >
            <div>
              <strong>Draw ID:</strong> {item.drawId}
            </div>
            <div>
              <strong>Snapshot:</strong> {formatDate(item.snapshotAt)}
            </div>
            <div>
              <strong>Eligible Wallets:</strong>{' '}
              {typeof item.eligibleCount === 'number'
                ? formatNumber(item.eligibleCount)
                : '-'}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <ActionButton
              label="Copy Winner"
              onClick={() => onCopy(item.winnerOwner, 'Winner wallet copied')}
            />
            <ActionButton
              label="Copy Draw ID"
              onClick={() => onCopy(item.drawId, 'Draw ID copied')}
            />
            <a
              href={getSolscanAddressUrl(item.winnerOwner)}
              target="_blank"
              rel="noreferrer"
              style={{
                border: '1px solid #d1d5db',
                background: '#ffffff',
                color: '#111827',
                borderRadius: 10,
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              View Winner on Solscan
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function NextDrawSection({
  schedule,
  loading,
}: {
  schedule: NextDrawState | null;
  loading: boolean;
}) {
  const countdownLabel = useMemo(() => {
    if (!schedule) {
      return '00d 00h 00m 00s';
    }

    return formatCountdownLabel(schedule.countdownMs);
  }, [schedule]);

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 20,
        padding: 24,
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: 16,
          fontSize: 22,
          color: '#111827',
        }}
      >
        ⏰ Next Draw
      </h2>

      {loading ? (
        <div
          style={{
            padding: 16,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            background: '#ffffff',
            color: '#6b7280',
          }}
        >
          Loading next draw schedule...
        </div>
      ) : !schedule ? (
        <div
          style={{
            padding: 16,
            border: '1px solid #fecaca',
            borderRadius: 12,
            background: '#fef2f2',
            color: '#991b1b',
          }}
        >
          Failed to load next draw schedule.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 20,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
              color: '#ffffff',
              borderRadius: 16,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                opacity: 0.8,
                marginBottom: 8,
              }}
            >
              COUNTDOWN
            </div>

            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: 10,
              }}
            >
              {countdownLabel}
            </div>

            <div
              style={{
                fontSize: 14,
                opacity: 0.9,
              }}
            >
              {schedule.enabled ? 'Scheduling enabled' : 'Scheduling disabled'}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            <StatCard
              label="Current Draw Index"
              value={formatNumber(schedule.drawIndex)}
            />
            <StatCard
              label="Current Interval Hours"
              value={formatNumber(schedule.currentIntervalHours)}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gap: 14,
              fontSize: 14,
              color: '#374151',
            }}
          >
            <div>
              <strong>Next Draw At:</strong> {formatDate(schedule.nextDrawAtIso)}
            </div>
            <div>
              <strong>Timezone:</strong> {schedule.timezone}
            </div>
            <div>
              <strong>First Draw Anchor:</strong>{' '}
              {formatDate(schedule.firstDrawAtIso)}
            </div>
            <div>
              <strong>Previous Draw At:</strong>{' '}
              {schedule.previousDrawAtIso
                ? formatDate(schedule.previousDrawAtIso)
                : '-'}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ProofPage() {
  const [data, setData] = useState<DrawResponse | null>(null);
  const [history, setHistory] = useState<DrawHistoryItem[]>([]);
  const [nextDraw, setNextDraw] = useState<NextDrawState | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [nextDrawLoading, setNextDrawLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const showCopyMessage = (message: string) => {
    setCopyMessage(message);

    window.setTimeout(() => {
      setCopyMessage('');
    }, 2000);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showCopyMessage(label);
    } catch (error) {
      console.error(error);
      showCopyMessage('Copy failed');
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);

    try {
      const res = await fetch('/api/proof/history', {
        method: 'GET',
        cache: 'no-store',
      });

      const json: HistoryApiResponse = await res.json();

      if (!res.ok || !json.ok) {
        return;
      }

      setHistory(mapHistoryResponseToItems(json.history));
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadNextDraw = async () => {
    setNextDrawLoading(true);

    try {
      const res = await fetch('/api/proof/next-draw', {
        method: 'GET',
        cache: 'no-store',
      });

      const json: NextDrawApiResponse = await res.json();

      if (!res.ok || !json.ok || !json.schedule) {
        setNextDraw(null);
        return;
      }

      setNextDraw(json.schedule);
    } catch (error) {
      console.error(error);
      setNextDraw(null);
    } finally {
      setNextDrawLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    loadNextDraw();
  }, []);

  useEffect(() => {
    if (!nextDraw) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNextDraw((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          countdownMs: Math.max(current.countdownMs - 1000, 0),
        };
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [nextDraw]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadNextDraw();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const runDraw = async () => {
    setLoading(true);
    setData(null);
    setErrorMessage('');
    setCopyMessage('');

    try {
      const res = await fetch('/api/proof/run-draw', {
        method: 'GET',
        cache: 'no-store',
      });

      const json: DrawResponse = await res.json();

      if (!res.ok) {
        setData(json);
        setErrorMessage(json?.error || 'Request failed.');
        return;
      }

      setData(json);
      await loadHistory();
      await loadNextDraw();
    } catch (error) {
      console.error(error);
      setErrorMessage('Failed to run draw.');
    } finally {
      setLoading(false);
    }
  };

  const winnerWallet = data?.winner?.owner ?? '';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f9fafb',
        padding: 24,
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 20,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 34,
                  lineHeight: 1.1,
                  color: '#111827',
                }}
              >
                🎲 Rando Proof
              </h1>
              <p
                style={{
                  margin: '10px 0 0 0',
                  color: '#6b7280',
                  fontSize: 16,
                }}
              >
                Run a holder draw and review the proof output in one place.
              </p>
            </div>

            <button
              onClick={runDraw}
              disabled={loading}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '14px 20px',
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#9ca3af' : '#111827',
                color: '#ffffff',
                minWidth: 160,
              }}
            >
              {loading ? 'Running draw...' : 'Run Draw'}
            </button>
          </div>

          {copyMessage && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {copyMessage}
            </div>
          )}
        </div>

        {loading && (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 20,
              padding: 24,
              color: '#374151',
              marginBottom: 24,
            }}
          >
            Running draw and loading proof data...
          </div>
        )}

        {errorMessage && !loading && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 20,
              padding: 24,
              color: '#991b1b',
              marginBottom: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>❌ Error</h2>
            <p style={{ marginBottom: 0 }}>{errorMessage}</p>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gap: 24,
            marginBottom: 24,
          }}
        >
          <NextDrawSection schedule={nextDraw} loading={nextDrawLoading} />

          {!data && !loading && !errorMessage && (
            <>
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  padding: 24,
                  color: '#6b7280',
                }}
              >
                Click <strong>Run Draw</strong> to generate a winner and proof
                report.
              </div>

              <section
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  padding: 24,
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    fontSize: 22,
                    color: '#111827',
                  }}
                >
                  🕘 Recent Draws
                </h2>

                {historyLoading ? (
                  <div
                    style={{
                      padding: 16,
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      background: '#ffffff',
                      color: '#6b7280',
                    }}
                  >
                    Loading recent draws...
                  </div>
                ) : (
                  <HistoryList items={history} onCopy={copyToClipboard} />
                )}
              </section>
            </>
          )}
        </div>

        {data &&
          data.ok &&
          data.draw &&
          data.rules &&
          data.counts &&
          data.winner && (
            <div
              style={{
                display: 'grid',
                gap: 24,
              }}
            >
              <section
                style={{
                  background:
                    'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
                  color: '#ffffff',
                  borderRadius: 20,
                  padding: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: 0.8,
                    marginBottom: 8,
                  }}
                >
                  🏆 WINNER
                </div>

                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    marginBottom: 10,
                    wordBreak: 'break-all',
                  }}
                >
                  {data.winner.owner}
                </div>

                <div
                  style={{
                    fontSize: 18,
                    opacity: 0.95,
                    marginBottom: 14,
                  }}
                >
                  Balance: {formatNumber(data.winner.uiAmount)}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <button
                    onClick={() =>
                      copyToClipboard(winnerWallet, 'Winner wallet copied')
                    }
                    style={{
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: '#ffffff',
                      color: '#111827',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Copy Winner Wallet
                  </button>

                  <a
                    href={getSolscanAddressUrl(winnerWallet)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: '#ffffff',
                      color: '#111827',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    View Winner on Solscan
                  </a>
                </div>
              </section>

              <section>
                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    fontSize: 22,
                    color: '#111827',
                  }}
                >
                  📈 Counts
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                  }}
                >
                  <StatCard
                    label="Total Token Accounts"
                    value={formatNumber(data.counts.totalTokenAccounts)}
                  />
                  <StatCard
                    label="Total Holders"
                    value={formatNumber(data.counts.totalHolders)}
                  />
                  <StatCard
                    label="After Exclusions"
                    value={formatNumber(data.counts.holderCountAfterExclusions)}
                  />
                  <StatCard
                    label="Eligible Wallets"
                    value={formatNumber(data.counts.eligibleCount)}
                  />
                </div>
              </section>

              <section
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 24,
                }}
              >
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 20,
                    padding: 24,
                  }}
                >
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: 16,
                      fontSize: 22,
                      color: '#111827',
                    }}
                  >
                    📊 Draw Info
                  </h2>

                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Draw ID
                      </div>
                      <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>
                        {data.draw.drawId}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Snapshot
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {formatDate(data.draw.snapshotAt)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Token Mint
                      </div>
                      <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>
                        {data.draw.tokenMint}
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <ActionButton
                          label="Copy Mint"
                          onClick={() =>
                            copyToClipboard(
                              data.draw.tokenMint,
                              'Token mint copied'
                            )
                          }
                        />
                        <a
                          href={getSolscanTokenUrl(data.draw.tokenMint)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            color: '#111827',
                            borderRadius: 10,
                            padding: '8px 12px',
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          View Token on Solscan
                        </a>
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Step
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {data.draw.step || '-'}
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 20,
                    padding: 24,
                  }}
                >
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: 16,
                      fontSize: 22,
                      color: '#111827',
                    }}
                  >
                    ⚙️ Rules
                  </h2>

                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Min Tokens
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {formatNumber(data.rules.minTokens)}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Decimals
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {data.rules.decimals}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 4,
                        }}
                      >
                        Excluded Wallets
                      </div>
                      <div style={{ fontWeight: 600 }}>
                        {data.rules.excludedWallets.length}
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#6b7280',
                          marginBottom: 8,
                        }}
                      >
                        Exclusion List
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        {data.rules.excludedWallets.length > 0 ? (
                          data.rules.excludedWallets.map((wallet) => (
                            <div
                              key={wallet}
                              style={{
                                padding: 10,
                                border: '1px solid #f3f4f6',
                                borderRadius: 10,
                                background: '#f9fafb',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 13,
                                  wordBreak: 'break-all',
                                  marginBottom: 10,
                                }}
                              >
                                {wallet}
                              </div>

                              <WalletActions
                                wallet={wallet}
                                onCopy={copyToClipboard}
                              />
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#6b7280' }}>
                            No excluded wallets.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  padding: 24,
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: 16,
                    fontSize: 22,
                    color: '#111827',
                  }}
                >
                  🕘 Recent Draws
                </h2>

                {historyLoading ? (
                  <div
                    style={{
                      padding: 16,
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      background: '#ffffff',
                      color: '#6b7280',
                    }}
                  >
                    Loading recent draws...
                  </div>
                ) : (
                  <HistoryList items={history} onCopy={copyToClipboard} />
                )}
              </section>

              <section
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 24,
                }}
              >
                <div>
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: 16,
                      fontSize: 22,
                      color: '#111827',
                    }}
                  >
                    🔍 Sample Eligible Wallets
                  </h2>
                  <WalletList
                    items={data.proof?.eligibleWalletSample}
                    emptyText="No eligible wallet sample returned."
                    winnerWallet={winnerWallet}
                    onCopy={copyToClipboard}
                  />
                </div>

                <div>
                  <h2
                    style={{
                      marginTop: 0,
                      marginBottom: 16,
                      fontSize: 22,
                      color: '#111827',
                    }}
                  >
                    🐋 Top Holders
                  </h2>
                  <WalletList
                    items={data.proof?.topEligibleSample}
                    emptyText="No top holder sample returned."
                    winnerWallet={winnerWallet}
                    onCopy={copyToClipboard}
                  />
                </div>
              </section>

              <section
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 20,
                  padding: 24,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      color: '#111827',
                    }}
                  >
                    🧾 Raw Proof JSON
                  </h2>

                  <ActionButton
                    label="Copy JSON"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(data, null, 2),
                        'Proof JSON copied'
                      )
                    }
                  />
                </div>

                <pre
                  style={{
                    margin: 0,
                    background: '#111827',
                    color: '#f9fafb',
                    padding: 16,
                    borderRadius: 12,
                    overflowX: 'auto',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </section>
            </div>
          )}

        {data && !data.ok && !errorMessage && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 20,
              padding: 24,
              color: '#991b1b',
            }}
          >
            <h2 style={{ marginTop: 0 }}>❌ Error</h2>
            <p style={{ marginBottom: 0 }}>{data.error || 'Unknown error.'}</p>
          </div>
        )}
      </div>
    </main>
  );
}