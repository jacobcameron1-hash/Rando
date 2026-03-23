'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function TryPage() {
  const [tokenMint, setTokenMint] = useState('');

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
          Enter a token mint address to preview how Rando would select a winner.
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
            disabled
            className="w-full bg-orange-500 opacity-50 px-4 py-3 rounded-lg font-semibold cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>

        <div className="mt-6 text-sm text-gray-500">
          Simulation will be enabled in a future update.
        </div>
      </div>
    </main>
  );
}
