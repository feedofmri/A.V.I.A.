import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { useCockpitData } from '../api/CockpitData';
import { bff } from '../api/bff';

interface PulseModalProps {
  onClose: () => void;
}

// `field` is the PulseTelemetryRequest key; ranges are the backend's validation bounds.
const VITAL_FIELDS = [
  {
    key: 'hr',
    field: 'hr_bpm',
    min: 40,
    max: 180,
    label: 'Heart rate',
    unit: 'bpm',
    placeholder: '72',
  },
  {
    key: 'spo2',
    field: 'spo2_pct',
    min: 70,
    max: 100,
    label: 'SpO₂',
    unit: '%',
    placeholder: '97',
  },
  {
    key: 'eda',
    field: 'eda_tonic_us',
    min: 0.05,
    max: 40,
    label: 'EDA',
    unit: 'µS',
    placeholder: '2.5',
  },
  {
    key: 'rmssd',
    field: 'hrv_rmssd_ms',
    min: 5,
    max: 150,
    label: 'RMSSD',
    unit: 'ms',
    placeholder: '45',
  },
  {
    key: 'resp',
    field: 'resp_rate_bpm',
    min: 6,
    max: 45,
    label: 'Respiration',
    unit: 'br/min',
    placeholder: '14',
  },
  {
    key: 'temp',
    field: 'skin_temp_c',
    min: 25,
    max: 41,
    label: 'Skin temp',
    unit: '°C',
    placeholder: '33.9',
  },
];

export function PulseModal({ onClose }: PulseModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = modalRef.current;
    root?.querySelector<HTMLElement>('button,input')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && root) {
        const all = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select',
          ),
        );
        const first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  const { crew: CREW, refresh } = useCockpitData();
  const [crew, setCrew] = useState(CREW[0]?.id ?? 'okafor');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function validate() {
    const errs: Record<string, string> = {};
    for (const f of VITAL_FIELDS) {
      const raw = values[f.key]?.trim();
      if (!raw) {
        if (f.key === 'hr' || f.key === 'spo2')
          errs[f.key] = `${f.label} is required`;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max)
        errs[f.key] = `${f.label} must be ${f.min}–${f.max} ${f.unit}`;
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    const telemetry: Record<string, number> = {};
    for (const f of VITAL_FIELDS)
      if (values[f.key]?.trim()) telemetry[f.field] = Number(values[f.key]);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await bff.submitVitals(crew, telemetry);
      await refresh();
      onClose();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const spo2Val = Number(values['spo2']);
  const showSpo2Hint = values['spo2'] && spo2Val < 94 && spo2Val >= 70;

  return (
    <div
      id="pulse-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--modal-overlay, rgba(5,7,13,0.7))',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'view-in 150ms ease both',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Submit vitals"
        id="pulse-modal"
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: '90vh',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          backdropFilter: 'blur(24px)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="pulse-modal__header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--text-1)',
              }}
            >
              Submit vitals
            </div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                fontWeight: 400,
                marginTop: 2,
              }}
            >
              ARTEMIS TRANSIT · DAY 142
            </div>
          </div>

          {/* Crew selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {CREW.map((m) => (
              <button
                key={m.id}
                id={`pulse-crew-${m.id}`}
                className={`filter-tab${crew === m.id ? ' filter-tab--active' : ''}`}
                onClick={() => setCrew(m.id)}
                style={{ padding: '3px 10px', fontSize: 10 }}
              >
                {m.initials}
              </button>
            ))}
          </div>

          <button
            id="pulse-modal-close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div
            className="pulse-modal__grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px 20px',
              padding: '20px 24px',
            }}
          >
            {VITAL_FIELDS.map((f) => (
              <div key={f.key} className="form-field">
                <label
                  htmlFor={`pulse-field-${f.key}`}
                  style={{ color: 'var(--text-2)', fontWeight: 500 }}
                >
                  {f.label}
                  <span
                    style={{
                      color: '#94A3B8',
                      fontWeight: 400,
                      textTransform: 'none',
                      letterSpacing: 0,
                      marginLeft: 4,
                    }}
                  >
                    ({f.unit})
                  </span>
                </label>
                <input
                  id={`pulse-field-${f.key}`}
                  type="text"
                  inputMode="numeric"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                  style={
                    errors[f.key]
                      ? { borderColor: 'rgba(255,92,108,0.6)' }
                      : undefined
                  }
                />
                {errors[f.key] && (
                  <span
                    style={{ fontSize: 12, color: 'var(--crit)', marginTop: 2 }}
                  >
                    {errors[f.key]}
                  </span>
                )}
                {f.key === 'spo2' && showSpo2Hint && (
                  <span
                    className="chip"
                    style={{ marginTop: 4, display: 'inline-flex' }}
                  >
                    ⚠ SpO₂ below 94% — verify reading
                  </span>
                )}
              </div>
            ))}
          </div>

          {submitError && (
            <div
              className="caption"
              role="alert"
              style={{ color: 'var(--crit)', padding: '0 24px 12px' }}
            >
              {submitError}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '16px 24px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              style={{
                height: 38,
                minHeight: 38,
                maxHeight: 38,
                padding: '0 20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                borderRadius: 'var(--r-pill)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              id="pulse-submit-btn"
              type="submit"
              className="pulse-submit-btn"
              disabled={submitting}
              style={{
                height: 38,
                minHeight: 38,
                maxHeight: 38,
                padding: '0 6px 0 18px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxSizing: 'border-box',
                borderRadius: 'var(--r-pill)',
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                }}
              >
                Submit vitals
              </span>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.22)',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                  transform: 'none',
                  transition: 'none',
                }}
              >
                {submitting ? '◌' : '↗'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
