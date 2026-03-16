/**
 * GET /api/og?id=[projectId]
 *
 * Generates a dynamic 1200×630 Open Graph image showing the current draw
 * state for a project. Used as the og:image / twitter:image for the
 * /timer/[id] shareable page.
 */

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const TX_RESERVE_SOL = 0.1;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fmtCountdown(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function fmtInterval(ms: number): string {
  if (ms >= 3_600_000) return `${ms / 3_600_000}h`;
  if (ms >= 60_000) return `${ms / 60_000}m`;
  return `${ms / 1_000}s`;
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const id = searchParams.get('id') ?? '';

  let drawCount = 0;
  let pot = 0;
  let secsLeft = 0;
  let eligibility = '≥ 0.25% supply';
  let interval = '20m → 6h';

  try {
    const res = await fetch(`${origin}/api/projects/${id}`, {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const d = await res.json();
      drawCount = d.drawCount ?? 0;
      pot = Math.max((d.vaultBalanceSol ?? 0) - TX_RESERVE_SOL, 0);
      secsLeft = d.nextDrawAt
        ? Math.max(Math.floor((new Date(d.nextDrawAt).getTime() - Date.now()) / 1000), 0)
        : 0;
      if (d.eligibilityType === 'percent') {
        eligibility = `≥ ${d.eligibilityValue}% supply`;
      } else {
        eligibility = `≥ ${Number(d.eligibilityValue).toLocaleString()} tokens`;
      }
      if (d.baseInterval) {
        const capMs = d.capMs as number | undefined;
        interval = capMs
          ? `${d.baseInterval} → ${fmtInterval(capMs)}`
          : d.baseInterval;
      }
    }
  } catch {
    // Render with defaults if fetch fails
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(140deg, #07000f 0%, #13002a 60%, #1a0040 100%)',
          fontFamily: 'monospace',
          color: '#f0e8ff',
          padding: '60px',
          boxSizing: 'border-box',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 28 }}>
          <span style={{ fontSize: 52 }}>🎲</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: '#c084fc' }}>
              $RANDO
            </span>
            <span style={{ fontSize: 15, color: '#7c3aed', letterSpacing: 3, marginTop: 2 }}>
              DRAW #{drawCount + 1}
            </span>
          </div>
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 14, color: '#7c6fa0', letterSpacing: 4, marginBottom: 10 }}>
            NEXT DRAW IN
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: 8,
              color: '#e9d5ff',
              lineHeight: 1,
            }}
          >
            {fmtCountdown(secsLeft)}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 60, marginBottom: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 38, fontWeight: 700, color: '#fbbf24' }}>
              {pot.toFixed(2)} SOL
            </div>
            <div style={{ fontSize: 13, color: '#7c6fa0', marginTop: 6, letterSpacing: 2 }}>
              PRIZE POOL
            </div>
          </div>
          <div style={{ width: 1, background: '#2d1b4e' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#a78bfa' }}>
              {eligibility}
            </div>
            <div style={{ fontSize: 13, color: '#7c6fa0', marginTop: 6, letterSpacing: 2 }}>
              HOLD REQUIREMENT
            </div>
          </div>
          <div style={{ width: 1, background: '#2d1b4e' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#a78bfa' }}>{interval}</div>
            <div style={{ fontSize: 13, color: '#7c6fa0', marginTop: 6, letterSpacing: 2 }}>
              INTERVAL
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', fontSize: 14, color: '#3b1f6e', letterSpacing: 2 }}>
          rando-mu.vercel.app · hold without selling · one random winner
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
