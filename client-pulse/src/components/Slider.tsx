import type { CSSProperties } from 'react';

interface Props {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  nominal?: number;
  decimals?: number;
  disabled?: boolean;
  flag?: string; // short warning chip, e.g. "Hypoxia flag"
  onChange: (v: number) => void;
}

export function Slider({ label, unit, value, min, max, step, nominal, decimals = 0, disabled, flag, onChange }: Props) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <label className={disabled ? 'slider slider--off' : 'slider'}>
      <span className="slider__head">
        <span>{label}</span>
        <span className="slider__val">
          {flag && <em className="chip">{flag}</em>}
          <b>{value.toFixed(decimals)}</b> <small>{unit}</small>
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__scale">
        <span>{min}</span>
        {nominal != null && <span className="slider__nominal">nominal {nominal}</span>}
        <span>{max}</span>
      </span>
    </label>
  );
}
