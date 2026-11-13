import type { PulseTelemetryRequest, Status, Telemetry } from '../types';

/**
 * Maps the drawer state to the backend request.
 * CONCERN (for backend): the spec lists the key as `mission_day` (phase string OR integer 1-300), while the reference
 * test cases use `mission_timepoint`. We send `mission_day` as the phase string / integer AND `mission_timepoint`
 * for the three named phases. Drop whichever key the backend does not read.
 */
export function buildPayload(t: Telemetry): PulseTelemetryRequest {
  const custom = t.mission_phase === 'custom';
  return {
    crew_id: t.crew_id,
    input_origin: t.input_origin ?? 'manual',
    mission_day: custom
      ? Math.min(1000, Math.max(1, Math.round(t.mission_day_custom)))
      : t.mission_phase,
    ...(custom
      ? {}
      : { mission_timepoint: t.mission_phase as 'L-3' | 'R+1' | 'R+45' }),
    hr_bpm: t.hr_bpm,
    spo2_pct: t.spo2_pct,
    hrv_rmssd_ms: t.hrv_rmssd_ms,
    ...(t.hrv_sdnn_manual ? { hrv_sdnn_ms: t.hrv_sdnn_ms } : {}), // omitted => backend default rmssd * 1.15
    resp_rate_bpm: t.resp_rate_bpm,
    eda_tonic_us: t.eda_tonic_us,
    scr_peaks_min: t.scr_peaks_min,
    skin_temp_c: t.skin_temp_c,
    sleep_duration_hr: t.sleep_duration_hr,
    eeg_delta_rel: t.eeg_delta_rel,
    eeg_theta_rel: t.eeg_theta_rel,
    eeg_sigma_rel: t.eeg_sigma_rel,
    eeg_beta_rel: t.eeg_beta_rel,
    eog_std_uv: t.eog_std_uv,
  };
}

/** Spec thresholds: < 0.40 Nominal, 0.40-0.69 Warning, >= 0.70 Critical. */
export function statusFromAnomaly(score?: number): Status | undefined {
  if (score == null) return undefined;
  if (score >= 0.7) return 'Critical';
  if (score >= 0.4) return 'Warning';
  return 'Nominal';
}

/** Used ONLY when the backend is unreachable (shown as "Local estimate"). Same bands as client-cockpit/src/lib/status.ts. */
export function localStatus(hr: number, spo2: number): Status {
  if (hr < 40 || hr > 130 || spo2 < 90) return 'Critical';
  if (hr < 50 || hr > 100 || spo2 < 95) return 'Warning';
  return 'Nominal';
}
