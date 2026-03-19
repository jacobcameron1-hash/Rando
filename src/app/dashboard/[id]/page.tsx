'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { shortenAddress, formatSol } from '@/lib/utils';

type Round = {
  id: string;
  projectId: string;
  winner: string;
  percent: number;
  tx: string;
  timestamp: number;
};

type Project = {
  id: string;
  tokenName: string;
  tokenAddress: string;
  minPercent: number;
  simulatedPrizePool: number;
  createdAt: number;
};

type ProjectResponse = {
  project: Project;
  rounds: Round[];
  eligibleHolderCount: number;
  simulatedPrizePool: number;
};

export default function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [id, setId] = useState('');
  const [data, setData] = useState<ProjectResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const fetchProject = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');

      const res = await fetch(`/api/projects/${id}`, {
        cache: 'no-store',
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json?.error || 'Project not found');
        setData(null);
        return;
      }

      setData(json);
    } catch {
      setError('Failed to load project');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;

    fetchProject();
    const interval = setInterval(fetchProject, 30000);

    return () => clearInterval(interval);
  }, [id, fetchProject]);

  if (loading && !data && !error) {
    return (
      <div className="min-h-screen px-4 py-10" style={{ background: 'var(--background)' }}>
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <p style={{ color: 'var(--muted)' }}>Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.project) {
    return (
      <div className="min-h-screen px-4 py-10" style={{ background: 'var(--background)' }}>
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <h1 className="text-3xl font-bold mb-3">Project not found</h1>
            <p className="mb-6" style={{ color: 'var(--muted)' }}>
              {error || 'This project could not be loaded.'}
            </p>
            <Link href="/" className="underline">
              ← Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { project, rounds, eligibleHolderCount, simulatedPrizePool } = data;

  return (
    <div className="min-h-screen px-4 py-10" style={{ background: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">Rando Dashboard</h1>
            <p style={{ color: 'var(--muted)' }}>
              {project.tokenName} · {shortenAddress(project.tokenAddress)}
            </p>
          </div>

          <Link href="/" className="underline text-sm">
            ← Home
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <StatCard
            label="Prize pool"
            value={formatSol(simulatedPrizePool)}
            highlight
          />
          <StatCard
            label="Eligible holders"
            value={String(eligibleHolderCount)}
          />
          <StatCard
            label="Completed draws"
            value={String(rounds.length)}
          />
        </div>

        <div
          className="rounded-3xl p-8 mb-8"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 className="text-2xl font-bold mb-5">Configuration</h2>

          <div className="grid gap-5 md:grid-cols-2">
            <ConfigRow label="Project ID" value={project.id} mono />
            <ConfigRow label="Token name" value={project.tokenName} />
            <ConfigRow label="Token mint" value={project.tokenAddress} mono />
            <ConfigRow
              label="Minimum eligibility"
              value={`${project.minPercent}% of supply`}
            />
            <ConfigRow
              label="Created"
              value={new Date(project.createdAt).toLocaleString()}
            />
            <ConfigRow
              label="Simulated prize pool"
              value={formatSol(project.simulatedPrizePool)}
            />
          </div>
        </div>

        <div
          className="rounded-3xl p-8"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <h2 className="text-2xl font-bold mb-5">Draw History</h2>

          {rounds.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              No draws yet.
            </p>
          ) : (
            <div className="space-y-3">
              {rounds.map((round, index) => (
                <div
                  key={round.id}
                  className="rounded-2xl p-4 flex items-center justify-between gap-4"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div className="font-medium">Draw #{index + 1}</div>
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>
                      Winner: {shortenAddress(round.winner)}
                    </div>
                  </div>

                  <div className="text-right text-sm" style={{ color: 'var(--muted)' }}>
                    <div>{round.percent}% owned</div>
                    <div>{new Date(round.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: highlight ? 'rgba(155, 93, 229, 0.10)' : 'var(--card)',
        border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p
        className="text-2xl font-bold"
        style={{ color: highlight ? 'var(--accent)' : 'var(--foreground)' }}
      >
        {value}
      </p>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p
        className={mono ? 'font-mono text-sm break-all' : 'text-sm'}
        style={{ color: 'var(--foreground)' }}
      >
        {value}
      </p>
    </div>
  );
}