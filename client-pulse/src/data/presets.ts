import type { MissionPhase, SleepProfile, Telemetry } from '../types';

/** Nominal values and the default crew/phase come from the spec (Section 2 table: crew "okafor", phase R+1 / Day 142). */
export const NOMINAL: Telemetry = {
  crew_id: 'okafor',
  mission_phase: 'R+1',
  mission_day_custom: 142,
  hr_bpm: 64,
  spo2_pct: 98,
  hrv_rmssd_ms: 58,
  hrv_sdnn_manual: false,
  hrv_sdnn_ms: 66.7,
  resp_rate_bpm: 14.5,
  eda_tonic_us: 2.1,
  scr_peaks_min: 10,
  skin_temp_c: 33.9,
  sleep_duration_hr: 7.4,
  sleep_profile: 'deep',
  eeg_delta_rel: 0.9302,
  eeg_theta_rel: 0.0517,
  eeg_sigma_rel: 0.0048,
  eeg_beta_rel: 0.0014,
  eog_std_uv: 18.16,
};

export const PHASES: { id: MissionPhase; label: string }[] = [
  { id: 'L-3', label: 'Pre-flight baseline (L-3)' },
  { id: 'R+1', label: 'Active flight / return stress (R+1 · Day 142)' },
  { id: 'R+45', label: 'Recovery (R+45)' },
  { id: 'custom', label: 'Specific mission day (1–300)' },
];

/** UI slider ranges and nominal values exactly as in the spec. Backend "valid bounds" are wider, so every slider value is valid. */
export const LIMITS = {
  hr_bpm: { min: 45, max: 160, step: 1 },
  spo2_pct: { min: 88, max: 100, step: 1 },
  hrv_rmssd_ms: { min: 10, max: 130, step: 1 },
  hrv_sdnn_ms: { min: 10, max: 200, step: 0.1 },
  resp_rate_bpm: { min: 8, max: 35, step: 0.5 },
  eda_tonic_us: { min: 0.5, max: 15, step: 0.1 },
  scr_peaks_min: { min: 0, max: 60, step: 1 },
  skin_temp_c: { min: 31, max: 37, step: 0.1 },
  sleep_duration_hr: { min: 3, max: 10, step: 0.1 },
} as const;

/**
 * The spec says the Sleep Quality dropdown pre-fills the 5 EEG variables but does not list the numbers.
 * Values are the per-stage medians of the sleep encoder's calibration set (sleep_edf_sc4001_epochs_features.csv):
 * deep = N3, light = N1, restless = Wake. Values outside that distribution are misread by the encoder.
 */
export const SLEEP_PROFILES: Record<
  SleepProfile,
  { label: string; eeg: Pick<Telemetry, 'eeg_delta_rel' | 'eeg_theta_rel' | 'eeg_sigma_rel' | 'eeg_beta_rel' | 'eog_std_uv'> }
> = {
  deep: { label: 'Deep restorative sleep', eeg: { eeg_delta_rel: 0.9302, eeg_theta_rel: 0.0517, eeg_sigma_rel: 0.0048, eeg_beta_rel: 0.0014, eog_std_uv: 18.16 } },
  light: { label: 'Light fragmented sleep', eeg: { eeg_delta_rel: 0.6345, eeg_theta_rel: 0.2359, eeg_sigma_rel: 0.0196, eeg_beta_rel: 0.0321, eog_std_uv: 19.66 } },
  restless: { label: 'Restless wakefulness', eeg: { eeg_delta_rel: 0.8271, eeg_theta_rel: 0.0962, eeg_sigma_rel: 0.0099, eeg_beta_rel: 0.0251, eog_std_uv: 44.14 } },
};

/** Presets pre-fill every vital slider. Values for 2 and 3 follow reference test cases 2 and 3; preset 1 follows case 1 (L-3). */
export const PRESETS: { id: string; label: string; hint: string; apply: (b: Telemetry) => Telemetry }[] = [
  {
    id: 'nominal',
    label: 'Nominal baseline',
    hint: 'Resting values',
    apply: (b) => ({ ...NOMINAL, crew_id: b.crew_id, mission_phase: 'L-3', mission_day_custom: b.mission_day_custom }),
  },
  {
    id: 'sleep',
    label: 'Sleep debt & fatigue',
    hint: '4.9 h, shifted EEG',
    apply: (b) => ({
      ...NOMINAL,
      crew_id: b.crew_id,
      mission_phase: b.mission_phase,
      mission_day_custom: b.mission_day_custom,
      hr_bpm: 68,
      hrv_rmssd_ms: 46,
      sleep_duration_hr: 4.9,
      sleep_profile: 'light',
      ...SLEEP_PROFILES.light.eeg,
      eeg_delta_rel: 0.55,
    }),
  },
  {
    id: 'eva',
    label: 'EVA stress & cardio drift',
    hint: 'EDA 5.1, HR 96, low HRV',
    apply: (b) => ({
      ...NOMINAL,
      crew_id: b.crew_id,
      mission_phase: b.mission_phase,
      mission_day_custom: b.mission_day_custom,
      hr_bpm: 96,
      spo2_pct: 97,
      hrv_rmssd_ms: 31,
      eda_tonic_us: 5.1,
      scr_peaks_min: 35,
    }),
  },
];
