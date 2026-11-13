import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boneAlert,
  completeTelemetry,
  historySteps,
  type VitalRow,
} from './telemetry.js';
import type { Baseline } from './crew.js';
import type { TwinProjection } from '../clients/ml.js';

const baseline = {
  hr_bpm: 64,
  hr_sd: 5,
  rmssd_ms: 58,
  rmssd_sd: 8,
  sdnn_ms: 66.7,
  eda_us: 2.0,
  eda_sd: 0.6,
  sleep_hr: 7.4,
  sleep_sd: 0.6,
  resp_bpm: 14,
  skin_temp_c: 33.9,
  spo2_pct: 98,
  femoral_bmd: 0.939,
  lumbar_bmd: 1.12,
  adherence_pct: 70,
  updated_at: '',
} as Baseline;

const row = (
  hoursAgo: number,
  at: Date,
  extra: Partial<VitalRow> = {},
): VitalRow => ({
  id: hoursAgo,
  recorded_at: new Date(at.getTime() - hoursAgo * 3_600_000),
  heart_rate: 70,
  spo2: 98,
  eda: 2.2,
  hrv_rmssd_ms: 50,
  hrv_sdnn_ms: 57.5,
  resp_rate_bpm: 15,
  scr_peaks_min: 10,
  skin_temp_c: 33.9,
  sleep_duration_hr: 6.1,
  eeg_delta_rel: 0.63,
  eeg_theta_rel: 0.24,
  eeg_sigma_rel: 0.02,
  eeg_beta_rel: 0.03,
  eog_std_uv: 19.7,
  mission_day: 141,
  mission_timepoint: null,
  source: 'pulse',
  imputed_fields: [],
  ...extra,
});

test('completeTelemetry keeps every field the client sent', () => {
  const input = {
    hr_bpm: 96,
    spo2_pct: 97,
    eda_tonic_us: 5.1,
    hrv_rmssd_ms: 31,
    hrv_sdnn_ms: 40,
    resp_rate_bpm: 18,
    scr_peaks_min: 35,
    skin_temp_c: 34.3,
    sleep_duration_hr: 7.2,
    eeg_delta_rel: 0.9,
    eeg_theta_rel: 0.05,
    eeg_sigma_rel: 0.01,
    eeg_beta_rel: 0.01,
    eog_std_uv: 18,
    mission_day: 'R+1',
  };
  const { t, imputed } = completeTelemetry(input, undefined, baseline, 142);
  assert.deepEqual(imputed, []);
  assert.equal(t.mission_timepoint, 'R+1');
  assert.equal(t.mission_day, null);
});

test('completeTelemetry carries slow signals forward, then falls back to the baseline / documented defaults', () => {
  const at = new Date('2026-10-29T12:00:00Z');
  const { t, imputed } = completeTelemetry(
    { hr_bpm: 72, spo2_pct: 97 },
    row(1, at),
    baseline,
    142,
  );
  assert.equal(t.sleep_duration_hr, 6.1); // carried from the previous reading
  assert.equal(t.eda_tonic_us, 2.2);
  assert.equal(t.eeg.eeg_delta_rel, 0.63);
  assert.equal(t.hrv_sdnn_ms, 50 * 1.15); // documented default rmssd x 1.15
  assert.equal(t.scr_peaks_min, 15);
  assert.equal(t.mission_day, 142); // current mission configuration, not the last event day
  assert.ok(
    imputed.includes('sleep_duration_hr') && imputed.includes('eeg_delta_rel'),
  );

  const fresh = completeTelemetry(
    { hr_bpm: 72, spo2_pct: 97 },
    undefined,
    baseline,
    142,
  ).t;
  assert.equal(fresh.sleep_duration_hr, 7.4); // no history -> personal baseline
  assert.equal(fresh.eeg.eeg_delta_rel, null); // left for the inference service to derive
  assert.equal(fresh.mission_day, 142);
});

test('historySteps picks one reading per 12 h slot, oldest first, excluding the current slot', () => {
  const at = new Date('2026-10-29T12:00:00Z');
  const recent = [
    row(1, at),
    row(11, at),
    row(13, at),
    row(24, at),
    row(26, at),
    row(47, at),
    row(60, at),
    row(71, at),
  ];
  const steps = historySteps(recent, at);
  const ages = steps.map((s) =>
    Math.round((at.getTime() - s.recorded_at.getTime()) / 3_600_000),
  );
  assert.deepEqual(ages, [60, 47, 24, 11]); // slots 5,4,2,1; 13 h loses to the newer 11 h in slot 1; 71 h -> slot 6 (outside)
});

test('historySteps skips legacy rows without the model inputs', () => {
  const at = new Date('2026-10-29T12:00:00Z');
  assert.deepEqual(historySteps([row(12, at, { hrv_rmssd_ms: null })], at), []);
});

test('boneAlert fires only when a region reaches warning within the horizon', () => {
  const twin = (days: number | null) =>
    ({
      skeletal_risk_projection: {
        status: 'Nominal',
        warning_in_days: days,
        projected_bmd: 1.09,
        adherence_pct: 70,
        adherence_factor: 1,
        horizon_days: 60,
        uncoupling_delta: 0.152,
        method: 'heuristic_bridge',
        note: 'n',
        regions: {
          femoral: {
            today_bmd: 0.939,
            projected_bmd: 0.91,
            rate_per_day: 0.0005,
            status_today: 'Nominal',
            status_projected: 'Warning',
            warning_in_days: days,
            critical_in_days: 142,
          },
          lumbar: {
            today_bmd: 1.12,
            projected_bmd: 1.09,
            rate_per_day: 0.0004,
            status_today: 'Nominal',
            status_projected: 'Nominal',
            warning_in_days: 93,
            critical_in_days: 233,
          },
        },
      },
      cardiovascular: {},
      dermal: {},
    }) as TwinProjection;
  const a = boneAlert(twin(40));
  assert.ok(a && a.kind === 'bone' && a.title.includes('in 40 d'));
  assert.equal(
    a!.contributions.reduce((s, c) => s + c.pct, 0),
    100,
  );
  assert.equal(boneAlert(twin(75)), null);
});
