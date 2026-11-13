import { useCallback, useEffect, useState, useRef } from 'react';
import { useCockpitData } from '../../api/CockpitData';
import { bff } from '../../api/bff';

// `field` is the column in the stored personal baseline / mission record.
const BASELINE_FIELDS = [
  {
    key: 'hr_rest',
    field: 'hr_bpm',
    label: 'Resting HR',
    unit: 'bpm',
    placeholder: '60',
  },
  {
    key: 'rmssd',
    field: 'rmssd_ms',
    label: 'RMSSD baseline',
    unit: 'ms',
    placeholder: '45',
  },
  {
    key: 'eda_base',
    field: 'eda_us',
    label: 'EDA baseline',
    unit: 'µS',
    placeholder: '1.5',
  },
  {
    key: 'sleep_target',
    field: 'sleep_hr',
    label: 'Sleep target',
    unit: 'h',
    placeholder: '7.5',
  },
  {
    key: 'resp_rate',
    field: 'resp_bpm',
    label: 'Respiration rate',
    unit: 'br/min',
    placeholder: '14',
  },
  {
    key: 'spo2_base',
    field: 'spo2_pct',
    label: 'SpO₂ baseline',
    unit: '%',
    placeholder: '98',
  },
];

const MISSION_FIELDS = [
  {
    key: 'mission_day',
    field: 'mission_day',
    label: 'Mission day',
    unit: '',
    placeholder: '142',
  },
  {
    key: 'mission_phase',
    field: 'phase',
    label: 'Mission phase',
    unit: '',
    placeholder: 'Transit',
  },
  {
    key: 'duration',
    field: 'duration_days',
    label: 'Mission duration',
    unit: 'd',
    placeholder: '210',
  },
  {
    key: 'orbit_alt',
    field: 'orbit_altitude_km',
    label: 'Orbit altitude',
    unit: 'km',
    placeholder: '408',
  },
];

export function MissionSetupView() {
  const { crew: CREW, refresh } = useCockpitData();
  const [selectedCrew, setSelectedCrew] = useState(CREW[0]?.id ?? 'okafor');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestId = useRef(0);
  // Load the stored baseline for the selected crew member and the mission parameters into the form.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    const [baseline, mission] = await Promise.all([
      bff.baseline(selectedCrew),
      bff.mission(),
    ]);
    const next: Record<string, string> = {};
    for (const f of BASELINE_FIELDS)
      if (baseline[f.field] != null) next[f.key] = String(baseline[f.field]);
    for (const f of MISSION_FIELDS) {
      const v = mission[f.field as keyof typeof mission];
      if (v != null) next[`mission-${f.key}`] = String(v);
    }
    if (id === requestId.current) setValues(next);
  }, [selectedCrew]);

  useEffect(() => {
    load().catch((e: Error) => setSaveError(e.message));
    return () => {
      requestId.current++;
    };
  }, [load]);

  function handleReset() {
    setSaveError(null);
    load().catch((e: Error) => setSaveError(e.message));
  }

  async function handleSave() {
    const baseline: Record<string, number> = {};
    for (const f of BASELINE_FIELDS) {
      const raw = values[f.key]?.trim();
      if (raw) baseline[f.field] = Number(raw);
    }
    const mission: Record<string, string | number> = {};
    for (const f of MISSION_FIELDS) {
      const raw = values[`mission-${f.key}`]?.trim();
      if (raw) mission[f.field] = f.field === 'phase' ? raw : Number(raw);
    }
    if (
      [...Object.values(baseline), ...Object.values(mission)].some(
        (v) => typeof v === 'number' && !Number.isFinite(v),
      )
    ) {
      setSaveError('All numeric fields must be numbers');
      return;
    }
    try {
      setSaveError(null);
      await bff.saveConfiguration(selectedCrew, baseline, mission);
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }

  function set(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="setup-layout view-enter">
      {/* Crew selector */}
      <div className="tile" style={{ padding: '16px 20px' }}>
        <div
          className="label"
          style={{
            marginBottom: 12,
            fontWeight: 600,
            fontSize: 12,
            letterSpacing: '0.08em',
          }}
        >
          Select crew member
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CREW.map((m) => (
            <button
              key={m.id}
              id={`setup-crew-${m.id}`}
              className={`filter-tab${selectedCrew === m.id ? ' filter-tab--active' : ''}`}
              onClick={() => setSelectedCrew(m.id)}
              style={{ fontWeight: 600 }}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div
        className="setup-two-col"
        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
      >
        {/* Crew baselines */}
        <div className="tile setup-form-tile">
          <div className="view-title" style={{ fontSize: 18, fontWeight: 600 }}>
            Crew baselines
          </div>
          <div
            className="caption"
            style={{ color: 'var(--text-3)', marginTop: 4 }}
          >
            <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>
              {CREW.find((c) => c.id === selectedCrew)?.name}
            </strong>{' '}
            · {CREW.find((c) => c.id === selectedCrew)?.role}
          </div>
          <div className="setup-grid">
            {BASELINE_FIELDS.map((f) => (
              <div key={f.key} className="form-field">
                <label
                  htmlFor={`setup-${f.key}`}
                  style={{ color: 'var(--text-2)', fontWeight: 500 }}
                >
                  {f.label}{' '}
                  {f.unit && (
                    <span
                      style={{
                        color: '#94A3B8',
                        fontWeight: 400,
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      ({f.unit})
                    </span>
                  )}
                </label>
                <input
                  id={`setup-${f.key}`}
                  type="text"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Mission parameters */}
        <div className="tile setup-form-tile">
          <div className="view-title" style={{ fontSize: 18, fontWeight: 600 }}>
            Mission parameters
          </div>
          <div
            className="caption"
            style={{ color: 'var(--text-3)', fontWeight: 400, marginTop: 4 }}
          >
            Artemis Transit
          </div>
          <div className="setup-grid">
            {MISSION_FIELDS.map((f) => (
              <div key={f.key} className="form-field">
                <label
                  htmlFor={`setup-mission-${f.key}`}
                  style={{ color: 'var(--text-2)', fontWeight: 500 }}
                >
                  {f.label}{' '}
                  {f.unit && (
                    <span
                      style={{
                        color: '#94A3B8',
                        fontWeight: 400,
                        textTransform: 'none',
                        letterSpacing: 0,
                      }}
                    >
                      ({f.unit})
                    </span>
                  )}
                </label>
                <input
                  id={`setup-mission-${f.key}`}
                  type="text"
                  placeholder={f.placeholder}
                  value={values[`mission-${f.key}`] ?? ''}
                  onChange={(e) => set(`mission-${f.key}`, e.target.value)}
                />
              </div>
            ))}
          </div>

          {saveError && (
            <div
              className="caption"
              role="alert"
              style={{ color: 'var(--crit)', marginTop: 16 }}
            >
              {saveError}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginTop: 24,
              justifyContent: 'flex-end',
              alignItems: 'center',
            }}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={handleReset}
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
              Reset
            </button>
            <button
              id="setup-save-btn"
              type="button"
              className="pulse-submit-btn"
              onClick={handleSave}
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
                cursor: 'pointer',
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
                {saved ? 'Configuration saved' : 'Save configuration'}
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
                ✓
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
