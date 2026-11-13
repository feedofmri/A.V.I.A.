import { useSession } from '../platform/session';
import { useEffect, useRef } from 'react';
import { CREW } from '../data/crew';
import {
  LIMITS,
  NOMINAL,
  PHASES,
  PRESETS,
  SLEEP_PROFILES,
} from '../data/presets';
import type {
  CrewId,
  MissionPhase,
  PulseTelemetryRequest,
  PulseTelemetryResponse,
  SleepProfile,
  Telemetry,
} from '../types';
import { Slider } from './Slider';

interface Props {
  open: boolean;
  onClose: () => void;
  crewId: CrewId;
  onCrewChange: (id: CrewId) => void;
  form: Telemetry;
  setForm: (t: Telemetry) => void;
  payload: PulseTelemetryRequest;
  syncing: boolean;
  onSync: () => void;
  result: PulseTelemetryResponse | null;
  error: string | null;
}

type NumKey = keyof typeof LIMITS;

export function TelemetryDrawer({
  open,
  onClose,
  crewId,
  onCrewChange,
  form,
  setForm,
  payload,
  syncing,
  onSync,
  result,
  error,
}: Props) {
  const user = useSession();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = <K extends keyof Telemetry>(k: K, v: Telemetry[K]) =>
    setForm({ ...form, [k]: v });
  const setProfile = (p: SleepProfile) =>
    setForm({ ...form, sleep_profile: p, ...SLEEP_PROFILES[p].eeg });

  const num = (
    k: NumKey,
    label: string,
    unit: string,
    decimals = 0,
    flag?: string,
  ) => (
    <Slider
      label={label}
      unit={unit}
      decimals={decimals}
      flag={flag}
      value={form[k] as number}
      nominal={k === 'hrv_sdnn_ms' ? undefined : (NOMINAL[k] as number)}
      {...LIMITS[k]}
      onChange={(v) => set(k, v as never)}
    />
  );

  const autoSdnn = Math.round(form.hrv_rmssd_ms * 1.15 * 10) / 10;
  const attributions = result?.modality_attributions_pct;
  const fo = result?.fusion_outputs;
  const fmt = (n?: number) => (n == null ? '—' : n.toFixed(2));

  return (
    <>
      <div className={open ? 'scrim scrim--on' : 'scrim'} onClick={onClose} />
      <aside
        className={open ? 'drawer drawer--on' : 'drawer'}
        aria-hidden={!open}
        aria-label="Telemetry input"
      >
        <header className="drawer__head">
          <div>
            <h2>Telemetry input</h2>
            <p>
              Simulate the wearable stream, then sync one reading to the
              backend.
            </p>
          </div>
          <button
            ref={closeRef}
            className="icon-btn"
            onClick={onClose}
            aria-label="Close telemetry input"
          >
            ✕
          </button>
        </header>

        <div className="drawer__body">
          <div className="presets" role="group" aria-label="Quick-test presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="preset"
                onClick={() =>
                  setForm({ ...p.apply(form), input_origin: 'scenario' })
                }
              >
                <b>{p.label}</b>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>

          <section className="group">
            <h3>
              <i className="gdot gdot--crew" />
              Crew and mission
            </h3>
            <label className="field">
              <span>Crew member</span>
              <select
                value={crewId}
                onChange={(e) => onCrewChange(e.target.value as CrewId)}
              >
                {CREW.filter(
                  (c) => user.role === 'operator' || c.id === user.crew,
                ).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.baselineId})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mission phase</span>
              <select
                value={form.mission_phase}
                onChange={(e) =>
                  set('mission_phase', e.target.value as MissionPhase)
                }
              >
                {PHASES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {form.mission_phase === 'custom' && (
              <label className="field">
                <span>Mission day (1–1000)</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={form.mission_day_custom}
                  onChange={(e) =>
                    set(
                      'mission_day_custom',
                      Math.min(300, Math.max(1, Number(e.target.value) || 1)),
                    )
                  }
                />
              </label>
            )}
          </section>

          <section className="group">
            <h3>
              <i className="gdot gdot--cardio" />
              Cardio-respiratory
            </h3>
            {num('hr_bpm', 'Heart rate', 'bpm')}
            {num(
              'spo2_pct',
              'Blood oxygen',
              '%',
              0,
              form.spo2_pct < 94 ? 'Hypoxia flag' : undefined,
            )}
            {num('hrv_rmssd_ms', 'HRV (RMSSD)', 'ms')}
            {num('resp_rate_bpm', 'Respiration rate', 'breaths/min', 1)}
            <details className="adv">
              <summary>Advanced controls</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.hrv_sdnn_manual}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      hrv_sdnn_manual: e.target.checked,
                      hrv_sdnn_ms: autoSdnn,
                    })
                  }
                />
                <span>Set HRV (SDNN) manually</span>
              </label>
              <Slider
                label="HRV (SDNN)"
                unit="ms"
                decimals={1}
                disabled={!form.hrv_sdnn_manual}
                {...LIMITS.hrv_sdnn_ms}
                value={form.hrv_sdnn_manual ? form.hrv_sdnn_ms : autoSdnn}
                onChange={(v) => set('hrv_sdnn_ms', v)}
              />
              {!form.hrv_sdnn_manual && (
                <p className="hint">
                  Not sent. The backend uses RMSSD × 1.15 = {autoSdnn} ms.
                </p>
              )}
            </details>
          </section>

          <section className="group">
            <h3>
              <i className="gdot gdot--stress" />
              Autonomic stress
            </h3>
            {num('eda_tonic_us', 'EDA skin conductance', 'µS', 1)}
            {num('scr_peaks_min', 'EDA phasic bursts', 'peaks/min')}
            {num('skin_temp_c', 'Skin temperature', '°C', 1)}
          </section>

          <section className="group">
            <h3>
              <i className="gdot gdot--sleep" />
              Sleep and recovery
            </h3>
            {num(
              'sleep_duration_hr',
              'Last night’s sleep',
              'h',
              1,
              form.sleep_duration_hr < 6 ? 'Sleep debt alert' : undefined,
            )}
            <label className="field">
              <span>Sleep quality</span>
              <select
                value={form.sleep_profile}
                onChange={(e) => setProfile(e.target.value as SleepProfile)}
              >
                {(Object.keys(SLEEP_PROFILES) as SleepProfile[]).map((k) => (
                  <option key={k} value={k}>
                    {SLEEP_PROFILES[k].label}
                  </option>
                ))}
              </select>
            </label>
            <details className="adv">
              <summary>Advanced EEG sliders</summary>
              <Slider
                label="Delta (relative power)"
                unit=""
                decimals={2}
                min={0}
                max={1}
                step={0.01}
                value={form.eeg_delta_rel}
                onChange={(v) => set('eeg_delta_rel', v)}
              />
              <Slider
                label="Theta (relative power)"
                unit=""
                decimals={2}
                min={0}
                max={1}
                step={0.01}
                value={form.eeg_theta_rel}
                onChange={(v) => set('eeg_theta_rel', v)}
              />
              <Slider
                label="Sigma (relative power)"
                unit=""
                decimals={2}
                min={0}
                max={1}
                step={0.01}
                value={form.eeg_sigma_rel}
                onChange={(v) => set('eeg_sigma_rel', v)}
              />
              <Slider
                label="Beta (relative power)"
                unit=""
                decimals={2}
                min={0}
                max={1}
                step={0.01}
                value={form.eeg_beta_rel}
                onChange={(v) => set('eeg_beta_rel', v)}
              />
              <Slider
                label="Eye movement (EOG std)"
                unit="µV"
                decimals={0}
                min={0}
                max={100}
                step={1}
                value={form.eog_std_uv}
                onChange={(v) => set('eog_std_uv', v)}
              />
            </details>
          </section>

          <details className="adv">
            <summary>Request JSON · POST /api/v1/pulse/ingest</summary>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
          </details>

          {error && (
            <p className="note note--err" role="alert">
              The backend did not accept this reading ({error}). The watch shows
              a local estimate until it responds.
            </p>
          )}

          {result && !error && (
            <div className="note note--ok" role="status">
              <b>Stored for {CREW.find((c) => c.id === crewId)?.name}</b>
              <span>
                Cockpit views read this from state, with no further network
                calls.
              </span>
              <div className="scores">
                <span>
                  <small>Status</small>
                  <b>{result.crew_status_badge ?? '—'}</b>
                </span>
                <span>
                  <small>Anomaly</small>
                  <b>{fmt(fo?.anomaly_score)}</b>
                </span>
                <span>
                  <small>Recovery</small>
                  <b>{fmt(fo?.recovery_score)}</b>
                </span>
                <span>
                  <small>Stress</small>
                  <b>{fmt(fo?.stress_score)}</b>
                </span>
              </div>
              {result.why_explanation && <span>{result.why_explanation}</span>}
              {attributions && (
                <div className="attr">
                  {Object.entries(attributions).map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <i style={{ width: `${Math.min(100, v)}%` }} />
                      <b>{v.toFixed(1)}%</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="drawer__foot">
          <button
            className="btn btn--primary"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? 'Syncing…' : 'Sync telemetry to Cockpit'}
          </button>
        </footer>
      </aside>
    </>
  );
}
