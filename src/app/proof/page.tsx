'use client';

import { useEffect, useState } from 'react';

type DrawResponse = {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  reason?: string;
  winner?: {
    owner: string;
    uiAmount: number;
  };
  payout?: {
    configUpdated: boolean;
    recipients: {
      role: string;
      wallet: string;
      basisPoints: number;
    }[];
    configSignatures: string[];
  };
};

type HistoryItem = {
  drawId: string;
  snapshotAt: string;
  winnerOwner: string;
  winnerAmount: number;
};

function shortWallet(w: string) {
  return `${w.slice(0, 6)}...${w.slice(-6)}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

export default function ProofPage() {
  const [data, setData] = useState<DrawResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const runDraw = async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/proof/run-draw?force=1', {
        cache: 'no-store',
      });
      const json = await res.json();
      setData(json);
      await loadHistory();
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    const res = await fetch('/api/proof/history', {
      cache: 'no-store',
    });
    const json = await res.json();

    if (json.ok) {
      setHistory(
        json.history.map((h: any) => ({
          drawId: h.drawId,
          snapshotAt: h.snapshotAt,
          winnerOwner: h.winner.owner,
          winnerAmount: h.winner.uiAmount,
        }))
      );
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1>🎲 Rando Proof</h1>

      <button onClick={runDraw} disabled={loading}>
        {loading ? 'Running...' : 'Run Draw & Update Rewards'}
      </button>

      {data?.error && (
        <div style={{ marginTop: 24 }}>
          <h2>❌ Error</h2>
          <div>{data.error}</div>
        </div>
      )}

      {data?.skipped && (
        <div style={{ marginTop: 24 }}>
          <h2>⏭️ Skipped</h2>
          <div>{data.reason || 'Draw was skipped.'}</div>
        </div>
      )}

      {data?.winner && (
        <div style={{ marginTop: 24 }}>
          <h2>🏆 Winner</h2>
          <div>{data.winner.owner}</div>
          <div>Balance: {data.winner.uiAmount}</div>
        </div>
      )}

      {data?.payout && (
        <div style={{ marginTop: 24 }}>
          <h2>💰 Reward Routing</h2>

          <div>
            Status: {data.payout.configUpdated ? '✅ Live' : '❌ Not updated'}
          </div>

          <div>Distribution: 50% / 50%</div>

          <div style={{ marginTop: 10 }}>
            <strong>Recipients:</strong>
          </div>

          {data.payout.recipients.map((r, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <div>{r.role}</div>
              <div>{r.wallet}</div>
              <div>{r.basisPoints / 100}%</div>
            </div>
          ))}

          <div style={{ marginTop: 10 }}>
            <strong>Transactions:</strong>
          </div>

          {data.payout.configSignatures.map((sig, i) => (
            <div key={i}>https://solscan.io/tx/{sig}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2>🕘 Recent Draws</h2>

        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div>{shortWallet(h.winnerOwner)}</div>
            <div>{formatDate(h.snapshotAt)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}