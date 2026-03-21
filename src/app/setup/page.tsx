'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction } from '@solana/web3.js';
import { IntervalInput } from '@/components/IntervalInput';
import { PercentInput } from '@/components/PercentInput';
import { parseInterval } from '@/lib/interval';

type Step = 1 | 2 | 3 | 4;

interface FormState {
  tokenMint: string;
  feeRecipientWallet: string;
  eligibilityType: 'percent' | 'amount';
  eligibilityValue: string;
  baseInterval: string;
  incrementInterval: string;
  capInterval: string;
}

const DEFAULT_FORM: FormState = {
  tokenMint: '',
  feeRecipientWallet: '',
  eligibilityType: 'percent',
  eligibilityValue: '0.1',
  baseInterval: '1m',
  incrementInterval: '1m',
  capInterval: '1h',
};

export default function SetupPage() {
  const router = useRouter();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  }

  function buildSummaryText(pid: string) {
    const mintShort = form.tokenMint
      ? `${form.tokenMint.slice(0, 6)}...${form.tokenMint.slice(-6)}`
      : '(unknown)';

    const eligLine =
      form.eligibilityType === 'percent'
        ? `${form.eligibilityValue}% of supply`
        : `${form.eligibilityValue} tokens`;

    const timerLine = `Base ${form.baseInterval}, +${form.incrementInterval} per selection, cap ${form.capInterval}`;
    const rewardsWallet = form.feeRecipientWallet
      ? `${form.feeRecipientWallet.slice(0, 6)}...${form.feeRecipientWallet.slice(-6)}`
      : '(not set)';

    const dashboardUrl = `https://rando-mu.vercel.app/dashboard/${pid}`;

    return [
      `🎲 Rando Randomized Rewards — ${mintShort}`,
      ``,
      `✅ Now live on bags.fm`,
      ``,
      `Eligibility: Hold ≥ ${eligLine} for the full interval`,
      `Selection timer: ${timerLine}`,
      `Rewards wallet: ${rewardsWallet}`,
      ``,
      `Dashboard: ${dashboardUrl}`,
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
      // no-op
    }
  }

  function validateStep(s: Step): string {
    if (s === 1) {
      if (!connected || !publicKey) return 'Please connect your wallet first';
      if (!form.tokenMint.trim()) return 'Token mint address is required';
      if (!form.feeRecipientWallet.trim()) {
        return 'Wallet receiving bags.fm fees is required';
      }
    }

    if (s === 2) {
      const v = parseFloat(form.eligibilityValue);
      if (isNaN(v) || v <= 0) return 'Eligibility value must be a positive number';
      if (form.eligibilityType === 'percent' && v > 100) {
        return 'Percent must be ≤ 100';
      }
    }

    if (s === 3) {
      try {
        const base = parseInterval(form.baseInterval);
        const inc = parseInterval(form.incrementInterval);
        const cap = parseInterval(form.capInterval);

        const oneMinute = 60_000;
        const oneHour = 3_600_000;
        const oneDay = 86_400_000;
        const sevenDays = 7 * oneDay;

        if (base < oneMinute || base > oneDay) {
          return 'Base interval must be between 1m and 1d';
        }

        if (inc < oneMinute || inc > oneDay) {
          return 'Increment must be between 1m and 1d';
        }

        if (cap < oneHour || cap > sevenDays) {
          return 'Cap must be between 1h and 7d';
        }

        if (cap < base) {
          return 'Cap must be greater than or equal to base interval';
        }
      } catch (e) {
        return e instanceof Error ? e.message : 'Invalid interval format';
      }
    }

    return '';
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }

    setStep((prev) => Math.min(prev + 1, 4) as Step);
  }

  function handleEligibilityTypeChange(type: 'percent' | 'amount') {
    update('eligibilityType', type);
    update('eligibilityValue', type === 'percent' ? '0.1' : '1000000');
  }

  async function submit() {
    const err = validateStep(3);
    if (err) {
      setError(err);
      return;
    }

    if (!publicKey) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setLoadingMsg('Creating rewards system...');

      const payload = {
        tokenMint: form.tokenMint.trim(),
        feeRecipientWallet: form.feeRecipientWallet.trim(),
        creatorWallet: publicKey.toBase58(),
        eligibilityType: form.eligibilityType,
        eligibilityValue: form.eligibilityValue,
        baseInterval: form.baseInterval,
        incrementInterval: form.incrementInterval,
        capInterval: form.capInterval,
        tokenAddress: form.tokenMint.trim(),
        tokenName: 'Rando Randomized Rewards',
        minPercent:
          form.eligibilityType === 'percent'
            ? parseFloat(form.eligibilityValue)
            : 0,
      };

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create project');
      }

      const pid = data?.projectId ?? data?.project?.id ?? data?.id;
      const setupTransactions = data?.setupTransactions ?? [];

      if (!pid) {
        throw new Error('Project created but no valid projectId was returned');
      }

      if (setupTransactions.length > 0) {
        setLoadingMsg(`Signing ${setupTransactions.length} transaction(s)...`);

        for (let i = 0; i < setupTransactions.length; i++) {
          setLoadingMsg(`Sending transaction ${i + 1} of ${setupTransactions.length}...`);

          const txBytes = Buffer.from(setupTransactions[i], 'base64');
          const tx = VersionedTransaction.deserialize(txBytes);

          const sig = await sendTransaction(tx, connection, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });

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
    <div className="min-h-screen px-4 py-10" style={{ background: 'var(--background)' }}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-4xl mb-2">🎲</div>
          <h1 className="text-5xl font-bold mb-3" style={{ color: 'var(--foreground)' }}>
            Set up Rando
          </h1>
          <p className="text-lg" style={{ color: 'var(--muted)' }}>
            Automated randomized rewards for your bags.fm token
          </p>
        </div>

        {step < 4 && (
          <div className="flex items-center justify-center mb-10">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg"
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
                    className="w-48 h-[2px]"
                    style={{
                      background: step > s ? 'var(--accent)' : 'var(--border)',
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div
          className="rounded-3xl p-8 md:p-10"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          }}
        >
          {step === 1 && (
            <>
              <h2
                className="text-4xl font-bold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Connect wallet & token
              </h2>

              <p className="text-xl leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Connect the wallet that manages your token on bags.fm. This wallet
                is used to sign in to Rando and manage your rewards system.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-2xl font-medium mb-3">
                    Your wallet (admin & login)
                  </label>

                  <div className="flex flex-col items-start gap-3">
                    {mounted ? (
                      <WalletMultiButton />
                    ) : (
                      <div
                        className="px-4 py-3 rounded-xl text-sm"
                        style={{
                          background: 'var(--background)',
                          border: '1px solid var(--border)',
                          color: 'var(--muted)',
                        }}
                      >
                        Loading wallet...
                      </div>
                    )}

                    {connected && publicKey && (
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Connected: {publicKey.toBase58().slice(0, 8)}...
                        {publicKey.toBase58().slice(-8)}
                      </p>
                    )}
                  </div>

                  <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
                    This should be the wallet you use to manage this token on bags.fm.
                  </p>
                </div>

                <FormField
                  label="Token mint address"
                  placeholder="So1111...41112"
                  value={form.tokenMint}
                  onChange={(v) => update('tokenMint', v)}
                  hint="The mint address of your bags.fm token."
                />

                <FormField
                  label="Wallet receiving bags.fm fees"
                  placeholder="Paste wallet from Bags fee sharing"
                  value={form.feeRecipientWallet}
                  onChange={(v) => update('feeRecipientWallet', v)}
                  hint="Go to Bags → Share Earnings and copy the wallet that receives the rewards funds."
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2
                className="text-4xl font-bold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Holder eligibility
              </h2>

              <p className="text-xl leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Set the minimum holding requirement. Holders must meet this
                threshold for the entire selection interval to be eligible.
              </p>

              <div className="space-y-6">
                <div>
                  <label className="block text-2xl font-medium mb-3">Threshold type</label>

                  <div
                    className="flex rounded-2xl overflow-hidden"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    {(['percent', 'amount'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleEligibilityTypeChange(t)}
                        className="flex-1 py-3 text-lg font-medium transition-all"
                        style={{
                          background:
                            form.eligibilityType === t ? 'var(--accent)' : 'transparent',
                          color:
                            form.eligibilityType === t ? 'white' : 'var(--muted)',
                        }}
                      >
                        {t === 'percent' ? '% of supply' : 'Token amount'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-2xl font-medium mb-3">
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
                      placeholder="1,000,000"
                      value={form.eligibilityValue}
                      onChange={(v) => update('eligibilityValue', v.replace(/,/g, ''))}
                      type="number"
                    />
                  )}

                  <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
                    {form.eligibilityType === 'percent'
                      ? 'Holders must hold this % of total supply for the entire selection interval'
                      : 'Raw token amount. Default starting point is 1,000,000.'}
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2
                className="text-4xl font-bold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Selection timer
              </h2>

              <p className="text-xl leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Configure the interval between selections. Use progressive timing to
                start fast and slow down automatically.
              </p>

              <div
                className="rounded-2xl px-5 py-4 mb-8 font-mono text-sm"
                style={{
                  background: 'var(--background)',
                  color: 'var(--accent)',
                  border: '1px solid var(--border)',
                }}
              >
                next_interval = min(base + (selections × increment), cap)
              </div>

              <div className="space-y-8">
                <IntervalInput
                  label="Base interval"
                  value={form.baseInterval}
                  onChange={(v) => update('baseInterval', v)}
                  hint="Starting selection frequency. e.g. 1m, 30m, 6h"
                  minMs={60_000}
                  maxMs={86_400_000}
                />

                <IntervalInput
                  label="Increment (per selection)"
                  value={form.incrementInterval}
                  onChange={(v) => update('incrementInterval', v)}
                  hint="How much to add after each selection. Use 1m to 1d."
                  minMs={60_000}
                  maxMs={86_400_000}
                />

                <IntervalInput
                  label="Cap (maximum interval)"
                  value={form.capInterval}
                  onChange={(v) => update('capInterval', v)}
                  hint="The interval will never exceed this. e.g. 1h to 7d"
                  minMs={3_600_000}
                  maxMs={7 * 86_400_000}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2
                className="text-4xl font-bold mb-4"
                style={{ color: 'var(--foreground)' }}
              >
                Rando is live!
              </h2>

              <p className="text-xl leading-relaxed mb-8" style={{ color: 'var(--muted)' }}>
                Your randomized rewards system is set up and running. The first
                selection fires automatically once fees accumulate.
              </p>

              <div
                className="rounded-2xl p-5 mb-6"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                }}
              >
                <h3 className="text-lg font-semibold mb-3">Your configuration</h3>

                <div className="space-y-1">
                  <SummaryRow label="Token mint" value={form.tokenMint} mono />
                  <SummaryRow
                    label="Fee wallet"
                    value={form.feeRecipientWallet}
                    mono
                  />
                  <SummaryRow
                    label="Eligibility"
                    value={
                      form.eligibilityType === 'percent'
                        ? `${form.eligibilityValue}% of supply`
                        : `${form.eligibilityValue} tokens`
                    }
                  />
                  <SummaryRow label="Base interval" value={form.baseInterval} />
                  <SummaryRow label="Increment" value={form.incrementInterval} />
                  <SummaryRow label="Cap" value={form.capInterval} />
                  {projectId && <SummaryRow label="Project ID" value={projectId} mono />}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
                    Share your rewards system — copy and paste this anywhere:
                  </p>

                  <button
                    onClick={() => copySummary(projectId)}
                    className="w-full py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                    style={{
                      background: copied ? 'rgba(200,152,0,0.15)' : 'var(--card)',
                      border: `1px solid ${
                        copied ? 'var(--accent-gold)' : 'var(--border)'
                      }`,
                      color: copied ? 'var(--accent-gold)' : 'var(--muted)',
                    }}
                  >
                    {copied ? '✓ Copied!' : 'Copy summary'}
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
            </>
          )}

          {error && (
            <p
              className="mt-6 text-sm text-red-400 rounded-lg p-3"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              {error}
            </p>
          )}

          {loading && loadingMsg && (
            <p
              className="mt-6 text-sm rounded-lg p-3 text-center"
              style={{ background: 'var(--background)', color: 'var(--accent)' }}
            >
              {loadingMsg}
            </p>
          )}

          {step < 4 && (
            <div className="flex gap-3 mt-10">
              {step > 1 && (
                <button
                  onClick={() => setStep((prev) => Math.max(prev - 1, 1) as Step)}
                  className="flex-1 py-3 rounded-xl font-medium transition-all hover:opacity-70"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
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
                  ? loadingMsg || 'Working...'
                  : step === 3
                  ? 'Create Rewards System'
                  : 'Continue →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-[var(--border)] last:border-0">
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span
        className={
          mono ? 'text-xs font-mono truncate max-w-[60%]' : 'text-xs text-right max-w-[60%]'
        }
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
      {label ? <label className="block text-sm font-medium mb-2">{label}</label> : null}

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

      {hint && (
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}