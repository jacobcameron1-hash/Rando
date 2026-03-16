'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { shortenAddress, formatSol, formatCountdown } from '@/lib/utils';

interface DrawRecord {
  drawNumber: number;
  winner: string | null;
  prizeAmountSol: number | null;
  txSignature: string | null;
  rolledOver: boolean;
  attempts: number;
  executedAt: string;
}

interface ProjectData {
  id: string;
  tokenMint: string;
  vaultPublicKey: string;
  eligibilityType: string;
  eligibilityValue: string;
  baseInterval: string;
  increment: string;
  cap: string;
  currentInterval: string;
  drawCount: number;
  nextDrawAt: string;
  isLocked: boolean;
  isActive: boolean;
  creatorWallet: string;
  vaultBalanceLamports: number;
  vaultBalanceSol: number;
  draws: DrawRecord[];
}

export default function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState('');
  const [project, setProject] = useState<ProjectData | null>(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const [locking, setLocking] = useState(false);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const embedRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Project not found');
        return;
      }
      setProject(await res.json());
    } catch {
      setError('Failed to load project');
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchProject();
    const interval = setInterval(() => { if (id) fetchProject(); }, 30_000);
    return () => clearInterval(interval);
  }, [id, fetchProject]);

  // Countdown timer
  useEffect(() => {
    if (!project) return;
    const tick = () => setCountdown(formatCountdown(new Date(project.nextDrawAt)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [project?.nextDrawAt]);

  async function handleLock() {
    if (!project || !lockConfirm) return;
    setLocking(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/lock`, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(
        `Lock transaction ready. In the wallet integration, you would sign:\n\n${data.lockTransaction?.slice(0, 60)}...\n\nThis is IRREVERSIBLE.`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Lock failed');
    } finally {
      setLocking(false);
      setLockConfirm(false);
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="underline" style={{ color: 'var(--accent)' }}>← Back home</Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎲</span>
          <div>
            <h1 className="font-bold text-lg">Rando Dashboard</h1>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {shortenAddress(project.tokenMint)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {project.isLocked && (
            <span
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid #22c55e' }}
            >
              🔒 Locked
            </span>
          )}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `🎲 $RANDO draw #${project.drawCount + 1} — ${project.vaultBalanceSol.toFixed(2)} SOL prize pool\n\nHold ≥${project.eligibilityValue}% without selling to qualify. Next draw live:\n`,
            )}&url=${encodeURIComponent(`https://rando-mu.vercel.app/timer/${project.id}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style={{ background: '#000', color: '#fff', border: '1px solid #333' }}
          >
            Share on 𝕏
          </a>
          <Link href="/" className="text-sm" style={{ color: 'var(--muted)' }}>← Home</Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Prize Pool" value={`${project.vaultBalanceSol.toFixed(4)} SOL`} highlight />
        <StatCard label="Next Draw" value={countdown} />
        <StatCard label="Total Draws" value={String(project.drawCount)} />
        <StatCard label="Current Interval" value={project.currentInterval} />
      </div>

      {/* Config */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-semibold mb-4">Configuration</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <ConfigRow label="Token Mint" value={shortenAddress(project.tokenMint)} />
          <ConfigRow label="Vault" value={shortenAddress(project.vaultPublicKey)} />
          <ConfigRow label="Eligibility" value={
            project.eligibilityType === 'percent'
              ? `${project.eligibilityValue}% of supply`
              : `${project.eligibilityValue} tokens`
          } />
          <ConfigRow label="Base Interval" value={project.baseInterval} />
          <ConfigRow label="Increment" value={project.increment} />
          <ConfigRow label="Cap" value={project.cap} />
        </div>
      </div>

      {/* Payout Summary */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-semibold mb-4">How Payouts Work</h2>
        <PayoutSummary project={project} />
      </div>

      {/* Embed Widget */}
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-semibold mb-1">Embed Widget</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Paste this into any webpage to show a live countdown and prize pool for your project.
        </p>
        <textarea
          ref={embedRef}
          readOnly
          value={buildEmbedCode(project.id)}
          className="w-full rounded-xl p-4 text-xs font-mono resize-none"
          style={{
            background: 'var(--background)',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            height: '160px',
          }}
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(buildEmbedCode(project.id));
            setEmbedCopied(true);
            setTimeout(() => setEmbedCopied(false), 2000);
          }}
          className="mt-3 px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {embedCopied ? '✓ Copied!' : 'Copy embed code'}
        </button>
      </div>

      {/* Admin lock */}
      {!project.isLocked && (
        <div
          className="rounded-2xl p-6 mb-6"
          style={{ background: 'var(--card)', border: '1px solid #7c3aed' }}
        >
          <h2 className="font-semibold mb-2">🔒 Lock Admin</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Permanently transfer fee share admin to the system program. This makes the
            split configuration irreversible and provably trustless — no one can ever
            change it again.
          </p>
          {lockConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-red-400 font-medium">
                ⚠️ This is IRREVERSIBLE. Are you absolutely sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setLockConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-sm"
                  style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleLock}
                  disabled={locking}
                  className="flex-1 py-2 rounded-lg text-sm text-white font-medium disabled:opacity-50"
                  style={{ background: '#dc2626' }}
                >
                  {locking ? 'Preparing...' : 'Yes, lock permanently'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setLockConfirm(true)}
              className="px-6 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-opacity"
              style={{ background: '#7c3aed' }}
            >
              Lock Admin →
            </button>
          )}
        </div>
      )}

      {/* Draw history */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <h2 className="font-semibold mb-4">Draw History</h2>
        {project.draws.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No draws yet. The first draw will run at {new Date(project.nextDrawAt).toLocaleString()}.
          </p>
        ) : (
          <div className="space-y-3">
            {project.draws.map((draw) => (
              <div
                key={draw.drawNumber}
                className="flex items-center justify-between rounded-xl p-4 text-sm"
                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                    #{draw.drawNumber}
                  </span>
                  {draw.rolledOver ? (
                    <span className="text-yellow-400">↩ Rolled over (no eligible holder)</span>
                  ) : (
                    <span>
                      🏆 <span className="font-mono">{shortenAddress(draw.winner!)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {draw.prizeAmountSol && (
                    <span className="font-medium" style={{ color: 'var(--accent)' }}>
                      {draw.prizeAmountSol.toFixed(4)} SOL
                    </span>
                  )}
                  {draw.txSignature && (
                    <a
                      href={`https://solscan.io/tx/${draw.txSignature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline"
                      style={{ color: 'var(--muted)' }}
                    >
                      verify ↗
                    </a>
                  )}
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(draw.executedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payout Summary ────────────────────────────────────────────────────────

function PayoutSummary({ project }: { project: ProjectData }) {
  const eligibility =
    project.eligibilityType === 'percent'
      ? `hold at least ${project.eligibilityValue}% of the total token supply`
      : `hold at least ${Number(project.eligibilityValue).toLocaleString()} tokens`;

  const schedule = (() => {
    const base = project.baseInterval;
    const inc  = project.increment;
    const cap  = project.cap;
    if (inc === '0m' || inc === '0s' || inc === '0h') {
      return `Draws run on a fixed ${base} interval.`;
    }
    return `The first draw fires ${base} after launch. Each draw adds ${inc} to the next interval, capping permanently at ${cap}.`;
  })();

  const lines = [
    { icon: '🎯', text: `Eligibility — To qualify for a draw, holders must ${eligibility} for the entire draw interval without selling. Any outbound transfer resets the clock.` },
    { icon: '⏱', text: `Schedule — ${schedule}` },
    { icon: '💰', text: `Prize split — Each draw distributes 33% of the available pot to the winner, 33% to operations, and 33% is used for a token buyback via Jupiter.` },
    { icon: '🔒', text: `Minimum pot — A draw only fires if the wallet holds at least 0.5 SOL above the 0.1 SOL transaction-fee reserve. If the pot is too low, draws pause and fees accumulate until the threshold is met — then the next winner collects everything.` },
  ];

  return (
    <div className="space-y-4">
      {lines.map(({ icon, text }, i) => (
        <div key={i} className="flex gap-3 text-sm">
          <span className="text-lg leading-snug">{icon}</span>
          <p style={{ color: 'var(--muted)' }}>{text}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Embed code builder ────────────────────────────────────────────────────

function buildEmbedCode(projectId: string): string {
  const apiUrl = `https://rando-mu.vercel.app/api/projects/${projectId}`;
  return `<div id="rando-widget"></div>
<script>
(function(){
  var API='${apiUrl}',RESERVE=0.1,el=document.getElementById('rando-widget');
  if(!el)return;
  var cached=null;
  function pad(n){return String(n).padStart(2,'0');}
  function fmt(s){var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;return pad(h)+':'+pad(m)+':'+pad(sc);}
  function render(){
    if(!cached)return;
    var pot=Math.max((cached.vaultBalanceSol||0)-RESERVE,0).toFixed(2);
    var rem=Math.max(Math.floor((new Date(cached.nextDrawAt)-Date.now())/1000),0);
    el.innerHTML='<div style="font-family:monospace;text-align:center;line-height:1.8">'
      +'<div>Next draw in: <strong>'+fmt(rem)+'</strong></div>'
      +'<div>Prize pool: <strong>'+pot+' SOL</strong></div>'
      +'</div>';
  }
  function load(){fetch(API).then(function(r){return r.json();}).then(function(d){cached=d;render();}).catch(function(){});}
  load();setInterval(load,30000);setInterval(render,1000);
})();
<\/script>`;
}

// ─── Shared sub-components ─────────────────────────────────────────────────

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: highlight ? 'rgba(155, 93, 229, 0.1)' : 'var(--card)',
        border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="font-bold text-lg" style={{ color: highlight ? 'var(--accent)' : 'inherit' }}>
        {value}
      </p>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
