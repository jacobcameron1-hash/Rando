'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  VersionedTransaction,
  TransactionMessage,
  PublicKey,
} from '@solana/web3.js';
import { IntervalInput } from '@/components/IntervalInput';
import { parseInterval } from '@/lib/interval';

type Step = 1 | 2 | 3 | 4;

interface FormState {
  tokenMint: string;
  eligibilityType: 'percent' | 'amount';
  eligibilityValue: string;
  baseInterval: string;
  incrementInterval: string;
  capInterval: string;
  vaultBps: number;
}

const DEFAULT_FORM: FormState = {
  tokenMint: '',
  eligibilityType: 'percent',
  eligibilityValue: '1',
  baseInterval: '1h',
  incrementInterval: '0',
  capInterval: '7d',
  vaultBps: 9500,
};

export default function SetupPage() {
  const router = useRouter();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function validateStep(s: Step): string {
    if (s === 1) {
      if (!connected || !publicKey) return 'Please connect your wallet first';
      if (!form.tokenMint.trim()) return 'Token mint address is required';
    }
    if (s === 2) {
      const v = parseFloat(form.eligibilityValue);
      if (isNaN(v) || v <= 0) return 'Eligibility value must be a positive number';
      if (form.eligibilityType === 'percent' && v > 100) return 'Percent must be ≤ 100';
    }
    if (s === 3) {
      try {
        const base = parseInterval(form.baseInterval);
        const inc = parseInterval(form.incrementInterval || '0');
        const cap = parseInterval(form.capInterval);
        if (base <= 0) return 'Base interval must be > 0';
        if (cap < base) return 'Cap must be ≥ base interval';
        if (inc < 0) return 'Increment cannot be negative';
      } catch (e) {
        return e instanceof Error ? e.message : 'Invalid interval format';
      }
    }
    return '';
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setStep((prev) => Math.min(prev + 1, 4) as Step);
  }

  async function submit() {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    if (!publicKey) { setError('Wallet not connected'); return; }

    setLoading(true);
    setError('');

    try {
      // Step 1: Create the project and get setup transactions back
      setLoadingMsg('Creating lottery...');
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          creatorWallet: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');

      const { projectId: pid, setupTransactions } = data as {
        projectId: string;
        setupTransactions: string[];
      };

      // Step 2: Sign and send each setup transaction
      if (setupTransactions && setupTransactions.length > 0) {
        setLoadingMsg(`Signing ${setupTransactions.length} transaction(s)...`);

        for (let i = 0; i < setupTransactions.length; i++) {
          setLoadingMsg(`Sending transaction ${i + 1} of ${setupTransactions.length}...`);
          const txBytes = Buffer.from(setupTransactions[i], 'base64');
          const tx = VersionedTransaction.deserialize(txBytes);

          const sig = await sendTransaction(tx, connection, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

          // Wait for confirmation before sending next tx
          await connection.confirmTransaction(sig, 'confirmed');
        }
      }

      setProjectId(pid);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">🎲</span>
          <h1 className="text-2xl font-bold mt-2">Set up Rando</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Automated holder lotteries for your bags.fm token
          </p>
        </div>

        {/* Progress */}
        {step < 4 && (
          <div className="flex items-center gap-2 mb-8">
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                  style={{
                    background: step >= s ? 'var(--accent)' : 'var(--card)',
                    border: `1px solid ${step >= s ? 'var(--accent)' : 'var(--border)'}`,
                    color: step >= s ? 'white' : 'var(--muted)',
                  }}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className="flex-1 h-px"
                    style={{ background: step > s ? 'var(--accent)' : 'var(--border)' }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {/* Step 1: Connect Wallet + Token */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Connect wallet & token</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Connect the wallet that owns the fee share admin for your token.
                </p>
              </div>

              {/* Wallet connect button */}
              <div>
                <label className="block text-sm font-medium mb-2">Your wallet</label>
                <WalletMultiButton
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    borderRadius: '12px',
                    background: connected ? 'var(--card)' : 'var(--accent)',
                    border: connected ? '1px solid var(--border)' : 'none',
                    color: connected ? 'var(--foreground)' : 'white',
                    fontSize: '14px',
                    height: '48px',
                  }}
                />
                {connected && publicKey && (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
                  </p>
                )}
              </div>

              <FormField
                label="Token mint address"
                placeholder="So11111...111112"
                value={form.tokenMint}
                onChange={(v) => update('tokenMint', v)}
                hint="The mint address of your bags.fm token."
              />
            </div>
          )}

          {/* Step 2: Eligibility */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Holder eligibility</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Set the minimum holding requirement. Holders must meet this threshold for
                  the entire draw interval to be eligible.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Threshold type</label>
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  {(['percent', 'amount'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => update('eligibilityType', t)}
                      className="flex-1 py-2 text-sm font-medium transition-all"
                      style={{
                        background: form.eligibilityType === t ? 'var(--accent)' : 'transparent',
                        color: form.eligibilityType === t ? 'white' : 'var(--muted)',
                      }}
                    >
                      {t === 'percent' ? '% of supply' : 'Token amount'}
                    </button>
                  ))}
                </div>
              </div>

              <FormField
                label={
                  form.eligibilityType === 'percent'
                    ? 'Minimum % of total supply'
                    : 'Minimum token amount'
                }
                placeholder={form.eligibilityType === 'percent' ? '1' : '1000000'}
                value={form.eligibilityValue}
                onChange={(v) => update('eligibilityValue', v)}
                hint={
                  form.eligibilityType === 'percent'
                    ? 'e.g. "1" = must hold at least 1% of total supply'
                    : 'Raw token amount (not accounting for decimals)'
                }
                type="number"
              />
            </div>
          )}

          {/* Step 3: Timer */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Draw timer</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Configure the interval between draws. Use progressive timing to start fast
                  and slow down automatically.
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-mono p-3 rounded-lg" style={{ background: 'var(--background)', color: 'var(--accent)' }}>
                  next_interval = min(base + (draws × increment), cap)
                </p>
              </div>

              <IntervalInput
                label="Base interval"
                value={form.baseInterval}
                onChange={(v) => update('baseInterval', v)}
                hint="Starting draw frequency. e.g. 1h, 30m, 6h"
                minMs={60_000}
                maxMs={7 * 86_400_000}
              />
              <IntervalInput
                label="Increment (per draw)"
                value={form.incrementInterval}
                onChange={(v) => update('incrementInterval', v)}
                hint="How much to add after each draw. Use 0 for flat interval."
                minMs={0}
                maxMs={86_400_000}
                allowZero
              />
              <IntervalInput
                label="Cap (maximum interval)"
                value={form.capInterval}
                onChange={(v) => update('capInterval', v)}
                hint="The interval will never exceed this. e.g. 7d"
                minMs={60_000}
                maxMs={30 * 86_400_000}
              />

              <div>
                <label className="block text-sm font-medium mb-2">
                  Vault fee share ({(form.vaultBps / 100).toFixed(1)}%)
                </label>
                <input
                  type="range"
                  min={1000}
                  max={9900}
                  step={100}
                  value={form.vaultBps}
                  onChange={(e) => update('vaultBps', Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  {(form.vaultBps / 100).toFixed(1)}% of your fees go to the prize pool.{' '}
                  Remaining {((10000 - form.vaultBps) / 100).toFixed(1)}% stays with you.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="text-5xl mb-2">🎉</div>
              <h2 className="text-xl font-semibold">Rando is live!</h2>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Your lottery is set up and running. The first draw will happen automatically
                once fees accumulate in the prize pool.
              </p>
              <button
                onClick={() => router.push(`/dashboard/${projectId}`)}
                className="w-full py-3 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity"
                style={{ background: 'var(--accent)' }}
              >
                View Dashboard →
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-4 text-sm text-red-400 rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
              {error}
            </p>
          )}

          {/* Loading state */}
          {loading && loadingMsg && (
            <p className="mt-4 text-sm rounded-lg p-3 text-center" style={{ background: 'var(--background)', color: 'var(--accent)' }}>
              {loadingMsg}
            </p>
          )}

          {/* Actions */}
          {step < 4 && (
            <div className="flex gap-3 mt-8">
              {step > 1 && (
                <button
                  onClick={() => setStep((prev) => Math.max(prev - 1, 1) as Step)}
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:opacity-70"
                  style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
                  disabled={loading}
                >
                  Back
                </button>
              )}
              <button
                onClick={step === 3 ? submit : next}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {loading
                  ? (loadingMsg || 'Working...')
                  : step === 3
                  ? 'Create Lottery'
                  : 'Continue →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  placeholder,
  value,
  onChange,
  hint,
  type = 'text',
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
        style={{
          background: 'var(--background)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
      />
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{hint}</p>}
    </div>
  );
}
