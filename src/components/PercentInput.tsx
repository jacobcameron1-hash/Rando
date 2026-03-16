'use client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
}

/**
 * Smart percent input with variable step sizes:
 * < 1%  → steps of 0.1
 * 1–2%  → steps of 0.25
 * > 2%  → steps of 0.5
 */
function getStep(value: number, direction: 'up' | 'down'): number {
  if (direction === 'down') {
    if (value <= 1) return 0.1;
    if (value <= 2) return 0.25;
    return 0.5;
  } else {
    if (value < 1) return 0.1;
    if (value < 2) return 0.25;
    return 0.5;
  }
}

function fmt(n: number): string {
  // Show up to 2 decimal places, strip trailing zeros
  return parseFloat(n.toFixed(2)).toString();
}

export function PercentInput({ value, onChange, min = 0.1, max = 100 }: Props) {
  const current = parseFloat(value) || 0;

  function adjust(direction: 'up' | 'down') {
    const step = getStep(current, direction);
    const next = direction === 'up' ? current + step : current - step;
    const clamped = Math.max(min, Math.min(max, Math.round(next * 100) / 100));
    onChange(fmt(clamped));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') { e.preventDefault(); adjust('up'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); adjust('down'); }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className="flex items-center rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border)', background: 'var(--background)' }}>
      <button
        type="button"
        onClick={() => adjust('down')}
        className="px-4 py-3 text-lg font-medium transition-opacity hover:opacity-60 select-none"
        style={{ color: 'var(--muted)', borderRight: '1px solid var(--border)' }}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step="any"
        className="flex-1 py-3 text-sm text-center outline-none bg-transparent"
        style={{ color: 'var(--foreground)', MozAppearance: 'textfield' } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={() => adjust('up')}
        className="px-4 py-3 text-lg font-medium transition-opacity hover:opacity-60 select-none"
        style={{ color: 'var(--muted)', borderLeft: '1px solid var(--border)' }}
      >
        +
      </button>
    </div>
  );
}
