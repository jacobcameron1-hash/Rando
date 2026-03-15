'use client';

import { useEffect, useState, useCallback } from 'react';
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
        <div className="flex items-center gap-2">
          {project.isLocked && (
            <span
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid #22c55e' }}
            >
              🔒 Locked
            </span>
          )}
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
