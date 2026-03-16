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
  return parseFloat(n.toFixed(2)).toString();
}

export function PercentInput({ value, onChange, min = 0.1, max = 100 }: Props) {
  const current = parseFloat(value);
  const valid = !isNaN(current);

  function adjust(direction: 'up' | 'down') {
    if (!valid) return;
    const step = getStep(current, direction);
    const next = direction === 'up' ? current + step : current - step;
    const clamped = Math.max(min, Math.min(max, Math.round(next * 100) / 100));
    onChange(fmt(clamped));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') { e.preventDefault(); adjust('up'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); adjust('down'); }
  }

  const btnStyle: React.CSSProperties = {
    color: 'var(--muted)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
    padding: '0 16px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--foreground)',
    fontSize: '14px',
    textAlign: 'center',
    // Hide native spinners in all browsers
    MozAppearance: 'textfield',
    WebkitAppearance: 'none',
    appearance: 'none',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        background: 'var(--background)',
        height: '48px',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => adjust('down')}
        style={{ ...btnStyle, borderRight: '1px solid var(--border)' }}
        tabIndex={-1}
      >
        −
      </button>

      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        style={inputStyle}
      />

      <button
        type="button"
        onClick={() => adjust('up')}
        style={{ ...btnStyle, borderLeft: '1px solid var(--border)' }}
        tabIndex={-1}
      >
        +
      </button>
    </div>
  );
}
