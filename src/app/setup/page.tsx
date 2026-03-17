'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { IntervalInput } from '@/components/IntervalInput';
import { PercentInput } from '@/components/PercentInput';
import { parseInterval } from '@/lib/interval';

type Step = 1 | 2 | 3 | 4 | 5;

interface FormState {
  tokenMint: string;
  eligibilityType: 'percent' | 'amount';
  eligibilityValue: string;
  baseInterval: string;
  incrementInterval: string;
  capInterval: string;
  vaultBps: number;
  privateKeyRaw: string;   // raw textarea input (JSON array string)
}

const DEFAULT_FORM: FormState = {
  tokenMint: '',
  eligibilityType: 'percent',
  eligibilityValue: '1',
  baseInterval: '1h',
  incrementInterval: '0',
  capInterval: '7d',
  vaultBps: 9500,
  privateKeyRaw: '',
};

/** Parse the raw textarea input into a 64-element number array, or return null. */
function parsePrivateKey(raw: string): number[] | null {
  try {
    const arr = JSON.parse(raw.trim());
    if (Array.isArray(arr) && arr.length === 64 && arr.every((n) => typeof n === 'number')) {
      return arr as number[];
    }
    return null;
  } catch {
    return null;
  }
}

/** Derive the public key from a 64-byte secret key array, or return null. */
function derivePublicKey(arr: number[]): string | null {
  try {
    const { Keypair } = require('@solana/web3.js');
    const kp = Keypair.fromSecretKey(Uint8Array.from(arr));
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

export default function SetupPage() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [copied, setCopied] = useState(false);

  function buildSummaryText(pid: string) {
    const mintShort = form.tokenMint
      ? `${form.tokenMint.slice(0, 6)}...${form.tokenMint.slice(-6)}`
      : '(unknown)';
    const eligLine =
      form.eligibilityType === 'percent'
        ? `${form.eligibilityValue}% of supply`
        : `${form.eligibilityValue} tokens`;
    const incLine =
      !form.incrementInterval || form.incrementInterval === '0'
        ? 'flat (no increment)'
        : `+${form.incrementInterval} per draw, cap ${form.capInterval}`;
    const prizePct = (form.vaultBps / 100).toFixed(1);
    const dashboardUrl = `https://rando-mu.vercel.app/dashboard/${pid}`;

    return [
      `🎲 Rando Lottery — ${mintShort}`,
      ``,
      `✅ Now live on bags.fm`,
      ``,
      `  Eligibility : Hold ≥ ${eligLine} for the full interval`,
      `  Draw timer  : Base ${form.baseInterval}, ${incLine}`,
      `  Prize share : ${prizePct}% of all trading fees`,
      ``,
      `Dashboard : ${dashboardUrl}`,
      ``,
      `Powered by $RANDO — https://randocoin.netlify.app`,
    ].join('\n');
  }

  async function copySummary(pid: string) {
    try {
      await navigator.clipboard.writeText(buildSummaryText(pid));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: user can manually copy
    }
  }

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
    if (s === 4) {
      if (!form.privateKeyRaw.trim()) return 'Private key is required';
      const arr = parsePrivateKey(form.privateKeyRaw);
      if (!arr) return 'Invalid private key — paste the full JSON array (64 numbers) exported from your wallet';
    }
    return '';
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setStep((prev) => Math.min(prev + 1, 5) as Step);
  }

  async function submit() {
    const err = validateStep(4);
    if (err) { setError(err); return; }
    if (!publicKey) { setError('Wallet not connected'); return; }

    const privateKeyJson = parsePrivateKey(form.privateKeyRaw)!;

    setLoading(true);
    setError('');

    try {
      setLoadingMsg('Creating lottery...');
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenMint: form.tokenMint,
          creatorWallet: publicKey.toBase58(),
          privateKeyJson,
          eligibilityType: form.eligibilityType,
          eligibilityValue: form.eligibilityValue,
          baseInterval: form.baseInterval,
          incrementInterval: form.incrementInterval,
          capInterval: form.capInterval,
          vaultBps: form.vaultBps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');

      setProjectId(data.projectId);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  // Derived public key preview for step 4
  const parsedKey = parsePrivateKey(form.privateKeyRaw);
  const derivedPubkey = parsedKey ? derivePublicKey(parsedKey) : null;

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
        {step < 5 && (
          <div className="flex items-center gap-2 mb-8">
            {([1, 2, 3, 4] as const).map((s) => (
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
                {s < 4 && (
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
                  Connect the wallet you use to manage this token.
                </p>
              </div>

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

              <div>
                <label className="block text-sm font-medium mb-2">
                  {form.eligibilityType === 'percent'
                    ? 'Minimum % of total supply'
                    : 'Minimum token amount'}
                </label>
                {form.eligibilityType === 'percent' ? (
                  <PercentInput
                    value={form.eligibilityValue}
                    onChange={(v) => update('eligibilityValue', v)}
                    min={0.1}
                    max={100}
                  />
                ) : (
                  <FormField
                    label=""
                    placeholder="1000000"
                    value={form.eligibilityValue}
                    onChange={(v) => update('eligibilityValue', v)}
                    type="number"
                  />
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  {form.eligibilityType === 'percent'
                    ? 'Holders must hold this % of total supply for the entire draw interval'
                    : 'Raw token amount (not accounting for decimals)'}
                </p>
              </div>
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
                hint="The interval will never exceed this. e.g. 12h"
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

          {/* Step 4: Prize wallet private key */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-1">Prize wallet</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Paste the private key of the wallet that receives fees from bags.fm.
                  The app stores it encrypted and uses it to automatically send prizes to winners.
                </p>
              </div>

              {/* Warning box */}
              <div
                className="rounded-xl p-4 text-sm space-y-1"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
              >
                <p className="font-semibold">⚠️ Security notice</p>
                <p style={{ color: 'var(--muted)' }}>
                  Only use a wallet dedicated to this prize pool — not your main wallet.
                  The private key is encrypted with AES-256-GCM before being stored.
                </p>
              </div>

              {/* How to export hint */}
              <div
                className="rounded-xl p-4 text-xs space-y-1"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                <p className="font-semibold" style={{ color: 'var(--foreground)' }}>How to export from Solflare</p>
                <p>Settings → Security → Export Private Key → select "JSON" format → copy the array.</p>
                <p>It should look like: <span className="font-mono">[12, 34, 56, ...]</span> (64 numbers).</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Private key (JSON array)</label>
                <textarea
                  rows={4}
                  placeholder='[12, 34, 56, 78, ...]'
                  value={form.privateKeyRaw}
                  onChange={(e) => update('privateKeyRaw', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-xs font-mono outline-none transition-all resize-none"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>

              {/* Live derived public key confirmation */}
              {derivedPubkey && (
                <div
                  className="rounded-xl p-3 text-xs"
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
                >
                  <p className="font-semibold mb-1" style={{ color: '#4ade80' }}>✓ Valid key — derived address:</p>
                  <p className="font-mono break-all" style={{ color: 'var(--muted)' }}>{derivedPubkey}</p>
                  <p className="mt-1" style={{ color: 'var(--muted)' }}>
                    Make sure this matches the wallet receiving bags.fm fees.
                  </p>
                </div>
              )}
              {form.privateKeyRaw.trim() && !derivedPubkey && (
                <p className="text-xs" style={{ color: '#f87171' }}>
                  Not a valid 64-element JSON array. Double-check your export format.
                </p>
              )}
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="text-center space-y-2">
                <div className="text-5xl mb-2">🎉</div>
                <h2 className="text-xl font-semibold">Rando is live!</h2>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Your lottery is set up and running. The first draw fires automatically
                  once fees accumulate.
                </p>
              </div>

              {/* Settings summary */}
              <div
                className="rounded-xl p-4 space-y-2 text-sm"
                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>
                  Your configuration
                </p>
                <SummaryRow label="Token" value={`${form.tokenMint.slice(0, 8)}...${form.tokenMint.slice(-8)}`} />
                <SummaryRow
                  label="Eligibility"
                  value={
                    form.eligibilityType === 'percent'
                      ? `Hold ≥ ${form.eligibilityValue}% of supply`
                      : `Hold ≥ ${form.eligibilityValue} tokens`
                  }
                />
                <SummaryRow label="Base draw" value={form.baseInterval} />
                <SummaryRow
                  label="Progressive"
                  value={
                    !form.incrementInterval || form.incrementInterval === '0'
                      ? 'Flat (no increment)'
                      : `+${form.incrementInterval}/draw → cap ${form.capInterval}`
                  }
                />
                <SummaryRow label="Prize share" value={`${(form.vaultBps / 100).toFixed(1)}% of trading fees`} />
                {projectId && <SummaryRow label="Project ID" value={projectId} mono />}
              </div>

              {/* Copy-paste block */}
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Share your lottery — copy and paste this anywhere:
                </p>
                <textarea
                  readOnly
                  value={buildSummaryText(projectId)}
                  rows={9}
                  className="w-full px-4 py-3 rounded-xl text-xs font-mono resize-none outline-none"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                />
                <button
                  onClick={() => copySummary(projectId)}
                  className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{
                    background: copied ? 'rgba(200,152,0,0.15)' : 'var(--card)',
                    border: `1px solid ${copied ? 'var(--accent-gold)' : 'var(--border)'}`,
                    color: copied ? 'var(--accent-gold)' : 'var(--muted)',
                  }}
                >
                  {copied ? '✓ Copied!' : '📋 Copy summary'}
                </button>
              </div>

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
          {step < 5 && (
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
                onClick={step === 4 ? submit : next}
                disabled={loading}
                className="flex-1 py-3 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                {loading
                  ? (loadingMsg || 'Working...')
                  : step === 4
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

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-[var(--border)] last:border-0">
      <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className={mono ? 'text-xs font-mono truncate max-w-[60%]' : 'text-xs text-right max-w-[60%]'}
        style={{ color: 'var(--foreground)' }}
      >
        {value}
      </span>
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
