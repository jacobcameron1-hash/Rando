'use client';

import { useEffect, useState, useCallback } from 'react';

const TX_RESERVE_SOL = 0.1;

interface Draw {
  drawNumber: number;
  winner: string | null;
  prizeAmountSol: number | null;
  txSignature: string | null;
  rolledOver: boolean;
  executedAt: string;
}

interface ProjectState {
  drawCount: number;
  nextDrawAt: string;
  vaultBalanceSol: number;
  eligibilityType: string;
  eligibilityValue: string;
  baseInterval: string;
  cap: string;
  draws: Draw[];
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function shorten(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function getSecsLeft(nextDrawAt?: string | null) {
  if (!nextDrawAt) return 0;

  const targetMs = new Date(nextDrawAt).getTime();
  if (Number.isNaN(targetMs)) return 0;

  return Math.max(Math.floor((targetMs - Date.now()) / 1000), 0);
}

export default function TimerClient({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [error, setError] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
      if (!res.ok) {
        setError(true);
        return;
      }

      const d = await res.json();
      setError(false);
      setState(d);
      setSecsLeft(getSecsLeft(d.nextDrawAt));
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    fetchState();
    const poll = setInterval(fetchState, 30_000);
    return () => clearInterval(poll);
  }, [fetchState]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecsLeft(getSecsLeft(state?.nextDrawAt));
    }, 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setSecsLeft(getSecsLeft(state?.nextDrawAt));
      }
    };

    const handleFocus = () => {
      setSecsLeft(getSecsLeft(state?.nextDrawAt));
    };

    setSecsLeft(getSecsLeft(state?.nextDrawAt));

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [state?.nextDrawAt]);

  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;

  const pot = state ? Math.max(state.vaultBalanceSol - TX_RESERVE_SOL, 0) : 0;

  const eligibility = state
    ? state.eligibilityType === 'percent'
      ? `≥ ${state.eligibilityValue}% of supply`
      : `≥ ${Number(state.eligibilityValue).toLocaleString()} tokens`
    : '…';

  const recentWinners =
    state?.draws.filter((d) => d.winner && !d.rolledOver).slice(0, 5) ?? [];
  const rollovers = state?.draws.filter((d) => d.rolledOver).length ?? 0;

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07000f',
          color: '#7c6fa0',
          fontFamily: 'monospace',
          fontSize: 14,
        }}
      >
        Project not found.
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'linear-gradient(140deg, #07000f 0%, #13002a 60%, #1a0040 100%)',
        fontFamily: 'monospace',
        color: '#f0e8ff',
        padding: '40px 24px 80px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎲</div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: 6,
          color: '#c084fc',
          marginBottom: 4,
        }}
      >
        $RANDO
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#7c3aed',
          letterSpacing: 3,
          marginBottom: 48,
        }}
      >
        DRAW #{state ? state.drawCount + 1 : '…'}
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#7c6fa0',
          letterSpacing: 4,
          marginBottom: 12,
        }}
      >
        NEXT DRAW IN
      </div>
      <div
        style={{
          fontSize: 'clamp(56px, 14vw, 104px)',
          fontWeight: 900,
          letterSpacing: 6,
          color: '#e9d5ff',
          lineHeight: 1,
          marginBottom: 56,
        }}
      >
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '32px 48px',
          marginBottom: 56,
        }}
      >
        <Stat label="PRIZE POOL" value={`${pot.toFixed(2)} SOL`} gold />
        <Stat label="HOLD REQUIREMENT" value={eligibility} />
        <Stat label="INTERVAL" value={state ? `${state.baseInterval} → ${state.cap}` : '…'} />
        {rollovers > 0 && <Stat label="ROLLOVERS" value={String(rollovers)} />}
      </div>

      <p
        style={{
          fontSize: 13,
          color: '#5b4a7a',
          maxWidth: 420,
          lineHeight: 1.8,
          marginBottom: 56,
        }}
      >
        Hold the requirement for the full interval without selling.
        Any outbound transfer resets your clock.
        One random eligible holder wins the pot.
      </p>

      <div
        style={{
          width: '100%',
          maxWidth: 480,
          marginBottom: 48,
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 4,
            color: '#7c3aed',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          RECENT WINNERS
        </div>

        {recentWinners.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: '#3b1f6e',
              padding: '24px',
              border: '1px solid #1a0840',
              borderRadius: 12,
            }}
          >
            No draws yet — be the first holder standing.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentWinners.map((draw) => (
              <div
                key={draw.drawNumber}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(124,58,237,0.08)',
                  border: '1px solid rgba(124,58,237,0.2)',
                  fontSize: 13,
                  gap: 8,
                }}
              >
                <span style={{ color: '#3b1f6e', flexShrink: 0 }}>
                  #{draw.drawNumber}
                </span>

                {draw.txSignature ? (
                  <a
                    href={`https://solscan.io/tx/${draw.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#c084fc',
                      textDecoration: 'none',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {draw.winner ? shorten(draw.winner) : '—'}
                  </a>
                ) : (
                  <span style={{ color: '#c084fc', flex: 1 }}>
                    {draw.winner ? shorten(draw.winner) : '—'}
                  </span>
                )}

                <span style={{ color: '#fbbf24', flexShrink: 0 }}>
                  {draw.prizeAmountSol != null ? `${draw.prizeAmountSol.toFixed(3)} SOL` : '—'}
                </span>

                <span style={{ color: '#3b1f6e', fontSize: 11, flexShrink: 0 }}>
                  {draw.executedAt ? timeAgo(draw.executedAt) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a
          href="https://randocoin.netlify.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: '1px solid #7c3aed',
            color: '#c084fc',
            fontSize: 13,
            textDecoration: 'none',
            letterSpacing: 1,
          }}
        >
          $RANDO →
        </a>
        <a
          href="https://rando-mu.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: '1px solid #3b1f6e',
            color: '#7c6fa0',
            fontSize: 13,
            textDecoration: 'none',
            letterSpacing: 1,
          }}
        >
          Run Rando for your token →
        </a>
      </div>
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ fontSize: 13, color: '#7c6fa0', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: gold ? '#fbbf24' : '#a78bfa' }}>
        {value}
      </div>
    </div>
  );
}