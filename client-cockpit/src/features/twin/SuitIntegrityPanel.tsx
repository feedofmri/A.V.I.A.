import { useEffect, useRef, useState } from 'react';
import {
  bff,
  type SuitInput,
  type SuitResult,
  type SuitTier,
} from '../../api/bff';

/**
 * Suit Integrity & Regional Pressure Control Panel (Digital_Twin_3D.MLAI_intrigation doc §2), driving the suit swelling
 * encoder through POST /api/v1/suit/evaluate. Slider names, units and ranges are the doc's Section B and match the
 * backend SuitRequest bounds; defaults are the backend / encoder nominal values.
 */

type Field = keyof SuitInput;

interface SliderDef {
  key: Field;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
}

const PRESSURE: SliderDef[] = [
  {
    key: 'suit_p_left_arm_psi',
    label: 'Left arm pressure',
    unit: 'psi',
    min: 1.0,
    max: 4.5,
    step: 0.1,
    decimals: 1,
  },
  {
    key: 'suit_p_right_arm_psi',
    label: 'Right arm pressure',
    unit: 'psi',
    min: 1.0,
    max: 4.5,
    step: 0.1,
    decimals: 1,
  },
  {
    key: 'suit_p_legs_psi',
    label: 'Lower body / legs pressure',
    unit: 'psi',
    min: 1.0,
    max: 4.5,
    step: 0.1,
    decimals: 1,
  },
  {
    key: 'suit_p_torso_psi',
    label: 'Torso / cabin pressure',
    unit: 'psi',
    min: 1.0,
    max: 4.5,
    step: 0.1,
    decimals: 1,
  },
];

const BIOIMPEDANCE: SliderDef[] = [
  {
    key: 'bioimp_left_arm_ohm',
    label: 'Left arm impedance',
    unit: 'Ω',
    min: 180,
    max: 330,
    step: 1,
    decimals: 0,
  },
  {
    key: 'bioimp_right_arm_ohm',
    label: 'Right arm impedance',
    unit: 'Ω',
    min: 180,
    max: 330,
    step: 1,
    decimals: 0,
  },
  {
    key: 'bioimp_legs_ohm',
    label: 'Legs impedance',
    unit: 'Ω',
    min: 150,
    max: 280,
    step: 1,
    decimals: 0,
  },
];

const VITALS: SliderDef[] = [
  {
    key: 'hr_bpm',
    label: 'Heart rate',
    unit: 'bpm',
    min: 50,
    max: 150,
    step: 1,
    decimals: 0,
  },
  {
    key: 'spo2_pct',
    label: 'Blood oxygen',
    unit: '%',
    min: 75,
    max: 100,
    step: 1,
    decimals: 0,
  },
  {
    key: 'resp_rate_bpm',
    label: 'Respiration rate',
    unit: 'br/min',
    min: 10,
    max: 35,
    step: 1,
    decimals: 0,
  },
];

const ALL_SLIDERS = [...PRESSURE, ...BIOIMPEDANCE, ...VITALS];

// 4.3 psi suit pressure; 305 Ω arm / 258 Ω leg baseline impedance (encoder base_arm_ohm / base_legs_ohm).
const NOMINAL: SuitInput = {
  suit_p_left_arm_psi: 4.3,
  suit_p_right_arm_psi: 4.3,
  suit_p_legs_psi: 4.3,
  suit_p_torso_psi: 4.3,
  bioimp_left_arm_ohm: 305,
  bioimp_right_arm_ohm: 305,
  bioimp_legs_ohm: 258,
  hr_bpm: 68,
  spo2_pct: 98,
  resp_rate_bpm: 15,
};

type PresetId = 'nominal' | 'left-breach' | 'decompression';

// Section A quick scenarios. Left breach: 4.3 - 2.0 = 2.3 psi, and 250 Ω = 305 Ω x (1 - 0.18) for the +18 % swelling.
const PRESETS: {
  id: PresetId;
  label: string;
  apply: (cur: SuitInput) => SuitInput;
}[] = [
  { id: 'nominal', label: 'Nominal EVA suit', apply: () => ({ ...NOMINAL }) },
  {
    id: 'left-breach',
    label: 'Left forearm breach',
    apply: () => ({
      ...NOMINAL,
      suit_p_left_arm_psi: 2.3,
      bioimp_left_arm_ohm: 250,
    }),
  },
  {
    id: 'decompression',
    label: 'Cabin decompression',
    apply: (cur) => ({
      ...cur,
      suit_p_left_arm_psi: 2.8,
      suit_p_right_arm_psi: 2.8,
      suit_p_legs_psi: 2.8,
      suit_p_torso_psi: 2.8,
    }),
  },
];

// Same palette as the twin's STAT_LABELS.
const TIER_COLOR: Record<SuitTier, string> = {
  Nominal: '#5EE0A8',
  Warning: '#F5B94A',
  Critical: '#FF5C6C',
};
const TIER_RANK: Record<SuitTier, number> = {
  Nominal: 0,
  Warning: 1,
  Critical: 2,
};

function validate(input: SuitInput): string | null {
  for (const s of ALL_SLIDERS) {
    const v = input[s.key];
    if (!Number.isFinite(v) || v < s.min || v > s.max)
      return `${s.label} must be ${s.min}–${s.max} ${s.unit}`;
  }
  return null;
}

function SliderRow({
  def,
  value,
  onChange,
}: {
  def: SliderDef;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 11,
          color: 'var(--text-2)',
        }}
      >
        <span>{def.label}</span>
        <span
          style={{
            fontWeight: 600,
            color: 'var(--text-1)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {value.toFixed(def.decimals)}{' '}
          <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>
            {def.unit}
          </span>
        </span>
      </span>
      <input
        id={`suit-${def.key}`}
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          cursor: 'pointer',
          accentColor: '#143493',
          height: 4,
          background: 'var(--border)',
          borderRadius: 2,
        }}
        aria-label={`${def.label} (${def.unit})`}
      />
    </label>
  );
}

const sectionLabel = {
  fontSize: 9,
  color: 'var(--text-3)',
  letterSpacing: '0.08em',
} as const;

export function SuitIntegrityPanel({
  crewId,
  onResult,
}: {
  crewId: string;
  onResult?: (r: SuitResult | null) => void;
}) {
  const [input, setInput] = useState<SuitInput>(NOMINAL);
  const [preset, setPreset] = useState<PresetId | null>('nominal');
  const [showControls, setShowControls] = useState(false);
  const [result, setResult] = useState<SuitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const invalid = validate(input);

  // Re-evaluate on every change (debounced); responses from superseded requests are dropped.
  useEffect(() => {
    if (invalid) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true);
      bff
        .evaluateSuit(crewId, input)
        .then((r) => {
          if (id !== requestId.current) return;
          setResult(r);
          onResult?.(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (id === requestId.current) {
            setError(e.message);
            onResult?.(null);
          }
        })
        .finally(() => id === requestId.current && setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [crewId, input, invalid]);

  function set(key: Field, v: number) {
    setInput((prev) => ({ ...prev, [key]: v }));
    setPreset(null);
  }

  const map = result?.digital_twin_body_map;
  const worst = map
    ? (Object.values(map) as SuitTier[]).reduce(
        (a, b) => (TIER_RANK[b] > TIER_RANK[a] ? b : a),
        'Nominal',
      )
    : null;
  const regions: { label: string; tier?: SuitTier; swelling?: number }[] = [
    {
      label: 'Left forearm',
      tier: map?.left_forearm,
      swelling: result?.swelling_pct_by_region.left_forearm,
    },
    {
      label: 'Right forearm',
      tier: map?.right_forearm,
      swelling: result?.swelling_pct_by_region.right_forearm,
    },
    {
      label: 'Lower body / femoral',
      tier: map?.lower_body_femoral,
      swelling: result?.swelling_pct_by_region.lower_body_legs,
    },
    { label: 'Torso / cardiopulmonary', tier: map?.torso_cardiopulmonary },
  ];

  return (
    <div
      className="twin-suit-card"
      style={{
        margin: '0 20px 16px',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          className="label"
          style={{
            fontSize: 10,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
          }}
        >
          SUIT INTEGRITY · REGIONAL PRESSURE
        </span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {loading ? 'Evaluating…' : result ? 'Suit model' : ''}
        </span>
      </div>

      {/* Section A — quick scenario presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            id={`suit-preset-${p.id}`}
            type="button"
            className={`filter-tab${preset === p.id ? ' filter-tab--active' : ''}`}
            style={{ padding: '3px 10px', fontSize: 10 }}
            onClick={() => {
              setInput((cur) => p.apply(cur));
              setPreset(p.id);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Evaluation result */}
      {error && (
        <div
          role="alert"
          style={{
            fontSize: 11,
            lineHeight: 1.45,
            color: '#FF5C6C',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '6px 10px',
            borderRadius: 6,
          }}
        >
          Suit evaluation failed: {error}
        </div>
      )}
      {invalid && (
        <div role="alert" style={{ fontSize: 11, color: '#F5B94A' }}>
          {invalid}
        </div>
      )}
      {!result && !error && (
        <div
          className="caption"
          style={{ fontSize: 11, color: 'var(--text-3)' }}
        >
          Evaluating suit telemetry…
        </div>
      )}
      {result && worst && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            opacity: loading || error || invalid ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          <div
            id="suit-zone-banner"
            style={{
              fontSize: 11,
              lineHeight: 1.45,
              fontWeight: 600,
              color: TIER_COLOR[worst],
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '6px 10px',
              borderRadius: 6,
            }}
          >
            {result.predicted_zone_label}
            <div
              style={{
                fontWeight: 400,
                color: 'var(--text-3)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                marginTop: 2,
              }}
            >
              uncalibrated class probability{' '}
              {(result.zone_confidence * 100).toFixed(1)}% · non-nominal class
              probability {(result.depressurization_prob * 100).toFixed(1)}% ·
              not measured accuracy
              {(error || invalid) &&
                ' · last successful evaluation, not the current sliders'}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 68px 72px',
              gap: 8,
              ...sectionLabel,
            }}
          >
            <span>REGION</span>
            <span style={{ textAlign: 'right' }}>SWELLING</span>
            <span style={{ textAlign: 'right' }}>STATUS</span>
          </div>
          {regions.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) 68px 72px',
                gap: 8,
                alignItems: 'baseline',
                padding: '6px 8px',
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-1)',
                }}
              >
                {r.label}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-2)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {r.swelling == null ? '—' : `${r.swelling.toFixed(1)}%`}
              </span>
              <span
                style={{
                  textAlign: 'right',
                  fontSize: 12,
                  fontWeight: 600,
                  color: r.tier ? TIER_COLOR[r.tier] : 'var(--text-3)',
                }}
              >
                {r.tier ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Section B — granular sliders */}
      <button
        type="button"
        className="btn-ghost"
        aria-expanded={showControls}
        onClick={() => setShowControls((v) => !v)}
        style={{ fontSize: 11, alignSelf: 'flex-start' }}
      >
        {showControls ? 'Hide suit sliders ▲' : 'Adjust suit sliders ▼'}
      </button>
      {showControls && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { title: 'SUIT SEGMENT PRESSURE', defs: PRESSURE },
            {
              title: 'SEGMENTAL BIOIMPEDANCE · LOWER = MORE FLUID SWELLING',
              defs: BIOIMPEDANCE,
            },
            { title: 'SYSTEMIC VITALS', defs: VITALS },
          ].map((group) => (
            <div
              key={group.title}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <span style={sectionLabel}>{group.title}</span>
              {group.defs.map((def) => (
                <SliderRow
                  key={def.key}
                  def={def}
                  value={input[def.key]}
                  onChange={(v) => set(def.key, v)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
