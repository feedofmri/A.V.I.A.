/**
 * Demo reference data: the four Artemis Transit crew members from the docs, their personal pre-flight baselines,
 * and the scenario the telemetry generator follows. Baseline SDs are chosen so the reference cases reproduce the
 * documented z-scores (Sato Sleep_z -3.83 at 4.9 h, Diaz EDA_z +3.63 at 5.1 µS).
 */

export interface SeedCrew {
  id: string;
  slug: string;
  name: string;
  role: string;
  initials: string;
  baseline_code: string;
  sort_order: number;
  baseline: {
    hr_bpm: number; hr_sd: number; rmssd_ms: number; rmssd_sd: number; sdnn_ms: number;
    eda_us: number; eda_sd: number; sleep_hr: number; sleep_sd: number; resp_bpm: number;
    skin_temp_c: number; spo2_pct: number; femoral_bmd: number; lumbar_bmd: number; adherence_pct: number;
  };
}

export const SEED_CREW: SeedCrew[] = [
  {
    id: 'a71a0000-0000-4000-8000-000000000001', slug: 'okafor', name: 'Cmdr. A. Okafor', role: 'Commander',
    initials: 'AO', baseline_code: 'C001', sort_order: 1,
    baseline: { hr_bpm: 64, hr_sd: 5, rmssd_ms: 58, rmssd_sd: 8, sdnn_ms: 66.7, eda_us: 2.0, eda_sd: 0.6, sleep_hr: 7.4,
      sleep_sd: 0.6, resp_bpm: 14.0, skin_temp_c: 33.9, spo2_pct: 98, femoral_bmd: 0.939, lumbar_bmd: 1.12, adherence_pct: 70 },
  },
  {
    id: 'a71a0000-0000-4000-8000-000000000002', slug: 'brandt', name: 'Dr. L. Brandt', role: 'Flight Surgeon',
    initials: 'LB', baseline_code: 'C002', sort_order: 2,
    baseline: { hr_bpm: 60, hr_sd: 4.5, rmssd_ms: 62, rmssd_sd: 8, sdnn_ms: 71.3, eda_us: 1.9, eda_sd: 0.6, sleep_hr: 7.5,
      sleep_sd: 0.6, resp_bpm: 14.0, skin_temp_c: 33.8, spo2_pct: 98, femoral_bmd: 1.02, lumbar_bmd: 1.18, adherence_pct: 85 },
  },
  {
    id: 'a71a0000-0000-4000-8000-000000000003', slug: 'sato', name: 'M. Sato', role: 'Mission Specialist',
    initials: 'MS', baseline_code: 'C003', sort_order: 3,
    baseline: { hr_bpm: 66, hr_sd: 5, rmssd_ms: 52, rmssd_sd: 8, sdnn_ms: 59.8, eda_us: 2.1, eda_sd: 0.7, sleep_hr: 7.4,
      sleep_sd: 0.653, resp_bpm: 14.5, skin_temp_c: 33.9, spo2_pct: 98, femoral_bmd: 0.98, lumbar_bmd: 1.15, adherence_pct: 75 },
  },
  {
    id: 'a71a0000-0000-4000-8000-000000000004', slug: 'diaz', name: 'R. Diaz', role: 'Pilot',
    initials: 'RD', baseline_code: 'C004', sort_order: 4,
    baseline: { hr_bpm: 70, hr_sd: 6, rmssd_ms: 48, rmssd_sd: 7.5, sdnn_ms: 55.2, eda_us: 2.1, eda_sd: 0.826, sleep_hr: 7.2,
      sleep_sd: 0.7, resp_bpm: 15.0, skin_temp_c: 34.0, spo2_pct: 98, femoral_bmd: 0.995, lumbar_bmd: 1.16, adherence_pct: 65 },
  },
];

export const SEED_MISSION = { name: 'Artemis Transit', mission_day: 142, phase: 'Transit', duration_days: 210, orbit_altitude_km: 408 };

export const SEED_COUNTERMEASURES: { label: string; crew?: string }[] = [
  { label: 'Resistive exercise — 45 min' },
  { label: 'Cardio — 30 min cycling' },
  { label: 'Sleep hygiene brief — Sato', crew: 'sato' },
  { label: 'Stress check-in — Diaz', crew: 'diaz' },
];

/** Non-ML log entries the docs list as plain CRUD events (AIVI §1.2 rows 7-8). */
export const SEED_LOGS: { crew: string; kind: 'dermal_scan' | 'symptom' | 'device'; source: string; severity: string;
  title: string; detail: string; hoursAgo: number }[] = [
  { crew: 'diaz', kind: 'dermal_scan', source: 'DERMAL SCAN', severity: 'warning', title: 'Rash on left forearm grew 0.4 cm² in 24 h',
    detail: 'Illustrative rash example for the software demonstration; no camera measurement was performed.', hoursAgo: 5 },
  { crew: 'sato', kind: 'symptom', source: 'PULSE LOG', severity: 'warning', title: 'Symptom logged: Headache',
    detail: 'Headache logged on Pulse after the sleep period', hoursAgo: 3 },
  { crew: 'brandt', kind: 'device', source: 'APPLICATION', severity: 'info', title: 'Local application connection restored (demo)',
    detail: 'Illustrative local browser connection event; no hardware connection is represented.', hoursAgo: 7 },
];

/** Sleep-EDF per-stage medians (the sleep encoder's training distribution); same values as the Pulse sleep profiles. */
export const EEG = {
  deep: { eeg_delta_rel: 0.9302, eeg_theta_rel: 0.0517, eeg_sigma_rel: 0.0048, eeg_beta_rel: 0.0014, eog_std_uv: 18.16 },
  light: { eeg_delta_rel: 0.6345, eeg_theta_rel: 0.2359, eeg_sigma_rel: 0.0196, eeg_beta_rel: 0.0321, eog_std_uv: 19.66 },
};

/** The newest reading for each crew member = the docs' reference cases (AIVI §11.1) plus a nominal Okafor. */
export const LATEST: Record<string, Record<string, number>> = {
  okafor: { hr_bpm: 72, spo2_pct: 97, eda_tonic_us: 2.4, hrv_rmssd_ms: 55, sleep_duration_hr: 7.3, scr_peaks_min: 11, resp_rate_bpm: 14.5, skin_temp_c: 33.9 },
  brandt: { hr_bpm: 61, spo2_pct: 98, eda_tonic_us: 1.9, hrv_rmssd_ms: 62, sleep_duration_hr: 7.5, scr_peaks_min: 9, resp_rate_bpm: 14, skin_temp_c: 33.8 },
  sato: { hr_bpm: 68, spo2_pct: 98, eda_tonic_us: 2.1, hrv_rmssd_ms: 46, sleep_duration_hr: 4.9, scr_peaks_min: 12, resp_rate_bpm: 15, skin_temp_c: 33.9 },
  diaz: { hr_bpm: 96, spo2_pct: 97, eda_tonic_us: 5.1, hrv_rmssd_ms: 31, sleep_duration_hr: 7.2, scr_peaks_min: 35, resp_rate_bpm: 18, skin_temp_c: 34.3 },
};
