'use client';

import { useEffect, useState, useCallback } from 'react';

const TX_RESERVE_SOL = 0.1;

interface ProjectState {
  drawCount: number;
  nextDrawAt: string;
  vaultBalanceSol: number;
  eligibilityType: string;
  eligibilityValue: string;
  baseInterval: string;
  cap: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function TimerClient({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProjectState | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [error, setError] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) { setError(true); return; }
      const d = await res.json();
      setState(d);
      setSecsLeft(
        d.nextDrawAt
          ? Math.max(Math.floor((new Date(d.nextDrawAt).getTime() - Date.now()) / 1000), 0)
          : 0,
      );
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
      setSecsLeft((s) => Math.max(s - 1, 0));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const h = Math.floor(secsLeft / 3600);
  const m = Math.floor((secsLeft % 3600) / 60);
  const s = secsLeft % 60;

  const pot = state ? Math.max(state.vaultBalanceSol - TX_RESERVE_SOL, 0) : 0;

  const eligibility = state
    ? state.eligibilityType === 'percent'
      ? `≥ ${state.eligibilityValue}% of supply`
      : `≥ ${Number(state.eligibilityValue).toLocaleString()} tokens`
    : '…';

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
        justifyContent: 'center',
        background: 'linear-gradient(140deg, #07000f 0%, #13002a 60%, #1a0040 100%)',
        fontFamily: 'monospace',
        color: '#f0e8ff',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: 56, marginBottom: 12 }}>🎲</div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 6, color: '#c084fc', marginBottom: 4 }}>
        $RANDO
      </div>
      <div style={{ fontSize: 13, color: '#7c3aed', letterSpacing: 3, marginBottom: 48 }}>
        DRAW #{state ? state.drawCount + 1 : '…'}
      </div>

      {/* Countdown */}
      <div style={{ fontSize: 13, color: '#7c6fa0', letterSpacing: 4, marginBottom: 12 }}>
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

      {/* Stats */}
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
        <Stat
          label="INTERVAL"
          value={state ? `${state.baseInterval} → ${state.cap}` : '…'}
        />
      </div>

      {/* Rule */}
      <p style={{ fontSize: 13, color: '#5b4a7a', maxWidth: 420, lineHeight: 1.8, marginBottom: 48 }}>
        Hold the requirement for the full interval without selling.
        Any outbound transfer resets your clock.
        One random eligible holder wins 33% of the pot.
      </p>

      {/* Links */}
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
