export type Status = 'Nominal' | 'Warning' | 'Critical' | 'Unknown';
export type CrewId = 'okafor' | 'brandt' | 'sato' | 'diaz';
export type MissionPhase = 'L-3' | 'R+1' | 'R+45' | 'custom';
export type SleepProfile = 'deep' | 'light' | 'restless';
export type SimEvent = 'spo2' | 'critical' | null;

/** Everything the Pulse drawer edits. Field names match the backend JSON where possible. */
export interface Telemetry {
  input_origin?: 'manual' | 'scenario';
  crew_id: CrewId;
  mission_phase: MissionPhase;
  mission_day_custom: number; // used when mission_phase === 'custom' (1-300)
  hr_bpm: number;
  spo2_pct: number;
  hrv_rmssd_ms: number;
  hrv_sdnn_manual: boolean; // Advanced controls: when false, SDNN is omitted and the backend uses rmssd * 1.15
  hrv_sdnn_ms: number;
  resp_rate_bpm: number;
  eda_tonic_us: number;
  scr_peaks_min: number;
  skin_temp_c: number;
  sleep_duration_hr: number;
  sleep_profile: SleepProfile;
  eeg_delta_rel: number;
  eeg_theta_rel: number;
  eeg_sigma_rel: number;
  eeg_beta_rel: number;
  eog_std_uv: number;
}

/** Body of POST /api/v1/pulse/ingest (PulseTelemetryRequest). */
export interface PulseTelemetryRequest {
  input_origin?: 'manual' | 'scenario';
  event_id?: string;
  recorded_at?: string;
  crew_id: CrewId;
  /** Phase string ("L-3" | "R+1" | "R+45") or an integer day 1-300, as the spec allows. */
  mission_day: string | number;
  /** Also sent for the three named phases (the reference test cases use this key). Omitted for a custom day. */
  mission_timepoint?: 'L-3' | 'R+1' | 'R+45';
  hr_bpm: number;
  spo2_pct: number;
  hrv_rmssd_ms: number;
  hrv_sdnn_ms?: number;
  resp_rate_bpm: number;
  eda_tonic_us: number;
  scr_peaks_min: number;
  skin_temp_c: number;
  sleep_duration_hr: number;
  eeg_delta_rel: number;
  eeg_theta_rel: number;
  eeg_sigma_rel: number;
  eeg_beta_rel: number;
  eog_std_uv: number;
}

/**
 * Only the response fields Pulse reads. The full CockpitStateResponse is owned by the backend
 * (its schema is referenced in the docs but not included), so everything is optional.
 */
export interface PulseTelemetryResponse {
  crew_status_badge?: Status;
  fusion_outputs?: {
    anomaly_score?: number;
    recovery_score?: number;
    stress_score?: number;
  };
  why_explanation?: string;
  modality_attributions_pct?: Record<string, number>;
  hr_24h_bars?: number[];
  [key: string]: unknown;
}

export interface Symptom {
  id: number;
  label: string;
  at: string;
}
export interface Task {
  id: string;
  label: string;
  done: boolean;
}
