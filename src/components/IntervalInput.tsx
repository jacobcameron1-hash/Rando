'use client';

import { useState, useEffect } from 'react';
import { parseInterval, formatInterval } from '@/lib/interval';

interface Props {
  label: string;
  value: string;       // shorthand string e.g. "1h"
  onChange: (v: string) => void;
  hint?: string;
  minMs: number;
  maxMs: number;
  allowZero?: boolean;
}

/**
 * Interval input with both a slider (for quick adjustment) and a text
 * field (for exact values like "20m", "12h", "13d").
 */
export function IntervalInput({ label, value, onChange, hint, minMs, maxMs, allowZero }: Props) {
  const [text, setText] = useState(value);
  const [sliderMs, setSliderMs] = useState(() => {
    try { return parseInterval(value); } catch { return minMs; }
  });
  const [textError, setTextError] = useState('');

  // Sync when parent value changes
  useEffect(() => {
    setText(value);
    try {
      setSliderMs(parseInterval(value));
      setTextError('');
    } catch {
      // ignore
    }
  }, [value]);

  function handleTextChange(v: string) {
    setText(v);
    try {
      const ms = parseInterval(v);
      if (!allowZero && ms === 0) {
        setTextError('Must be > 0');
        return;
      }
      setSliderMs(ms);
      setTextError('');
      onChange(v);
    } catch {
      setTextError('Invalid format (e.g. 20m, 12h, 7d)');
    }
  }

  function handleSliderChange(v: number) {
    const ms = allowZero ? v : Math.max(v, minMs);
    setSliderMs(ms);
    const formatted = formatInterval(ms);
    setText(formatted);
    setTextError('');
    onChange(formatted);
  }

  const effectiveMin = allowZero ? 0 : minMs;

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="flex gap-3 items-start">
        {/* Slider */}
        <div className="flex-1">
          <input
            type="range"
            min={effectiveMin}
            max={maxMs}
            step={effectiveMin > 0 ? Math.max(effectiveMin, 60_000) : 60_000}
            value={Math.min(Math.max(sliderMs, effectiveMin), maxMs)}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
        </div>
        {/* Text input */}
        <div className="w-24 flex-shrink-0">
          <input
            type="text"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm text-center outline-none"
            style={{
              background: 'var(--background)',
              border: `1px solid ${textError ? '#ef4444' : 'var(--border)'}`,
              color: 'var(--foreground)',
            }}
            onFocus={(e) => {
              if (!textError) e.target.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              if (!textError) e.target.style.borderColor = 'var(--border)';
            }}
          />
        </div>
      </div>
      {textError ? (
        <p className="text-xs mt-1 text-red-400">{textError}</p>
      ) : hint ? (
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{hint}</p>
      ) : null}
    </div>
  );
}
