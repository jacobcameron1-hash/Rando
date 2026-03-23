'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function TryPage() {
  const [tokenMint, setTokenMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRunTest() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/proof/run-draw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ⚠️ THIS IS LOCAL ONLY — WILL NOT WORK IN PROD
          'x-rando-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || '',
        },
        body: JSON.stringify({
          tokenMint,
          simulate: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm text-orange-400 hover:underline">
          ← Back to Rando
        </Link>

        <h1 className="text-4xl font-bold mt-6 mb-4">
          Try Rando With Your Coin
        </h1>

        <p className="text-gray-400 mb-8">
          Enter a token mint address to simulate a draw. This does NOT affect
          production or real fee routing.
        </p>

        <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-gray-800">
          <label className="block text-sm mb-2 text-gray-400">
            Token Mint Address
          </label>

          <input
            value={tokenMint}
            onChange={(e) => setTokenMint(e.target.value)}
            placeholder="Enter token mint..."
            className="w-full p-3 rounded-lg bg-black border border-gray-700 text-white mb-4"
          />

          <button
            onClick={handleRunTest}
            disabled={!tokenMint || loading}
            className="w-full bg-orange-500 hover:bg-orange-600 transition px-4 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run Simulation'}
          </button>
        </div>

        {error && (
          <div className="mt-6 text-red-400">
            Error: {error}
          </div>
        )}

        {result && (
          <div className="mt-6 bg-[#1a1a1a] p-6 rounded-2xl border border-gray-800">
            <h2 className="text-xl font-semibold mb-4">Result</h2>

            <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}