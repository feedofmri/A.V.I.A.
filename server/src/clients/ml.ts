import { config } from '../config.js';

/** The inference service answered with an error, or could not be reached. */
export class MlError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`ML service ${status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.mlUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.mlTimeoutMs),
    });
  } catch (err) {
    throw new MlError(503, `inference service unreachable at ${config.mlUrl}: ${(err as Error).message}`);
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new MlError(res.status, (payload as { detail?: unknown } | null)?.detail ?? payload);
  return payload as T;
}

/** Telemetry exactly as the inference service's `Telemetry` schema expects it (snake_case). */
export interface MlTelemetry {
  hr_bpm: number;
  spo2_pct: number;
  eda_tonic_us: number;
  hrv_rmssd_ms: number;
  sleep_duration_hr: number;
  hrv_sdnn_ms?: number | null;
  resp_rate_bpm?: number;
  scr_peaks_min?: number;
  skin_temp_c?: number;
  eeg_delta_rel?: number | null;
  eeg_theta_rel?: number | null;
  eeg_sigma_rel?: number | null;
  eeg_beta_rel?: number | null;
  eog_std_uv?: number | null;
  mission_day?: number | string | null;
  mission_timepoint?: string | null;
}

export interface MlBaseline {
  hr_bpm: number;
  hr_sd: number;
  rmssd_ms: number;
  rmssd_sd: number;
  sdnn_ms: number | null;
  eda_us: number;
  eda_sd: number;
  sleep_hr: number;
  sleep_sd: number;
  resp_bpm: number;
  skin_temp_c: number;
  spo2_pct: number;
}

export interface MlAlert {
  kind: string;
  source: string;
  title: string;
  detail: string;
  value: string;
  rule: string;
  status: 'warning' | 'critical';
  model_derived: boolean;
  contributions: { label: string; pct: number }[];
  explanation: string;
}

export interface VitalForecast {
  values: number[];
  min: number;
  mean: number;
  max: number;
  forecast_end: number;
  driver: string;
}

export interface MlInference {
  crew_id: string;
  crew_status_badge: 'Nominal' | 'Warning' | 'Critical';
  fusion_outputs: { anomaly_score: number; recovery_score: number; stress_score: number };
  encoder_outputs: {
    cardiac_anomaly_prob: number;
    estimated_rr_bpm: number;
    stress_probability: number;
    predicted_sleep_stage: string;
    stage_confidence: number;
    recovery_index: number;
    nasa_context: { mission_timepoint: string; human_nlr_shift_pct: number; human_wbc_shift_pct: number };
  };
  personal_z_scores: { HR_z: number; HRV_z: number; Sleep_z: number; EDA_z: number };
  modality_attributions_pct: Record<string, number>;
  modality_mask: Record<string, number>;
  why_explanation: string;
  trajectory: Record<'anomaly' | 'recovery' | 'stress', number[]>;
  forecast_scores: Record<'anomaly' | 'recovery' | 'stress', number[]>;
  analytics_forecast_7step: Record<
    'hr_bpm' | 'spo2_pct' | 'eda_tonic_us' | 'hrv_rmssd_ms' | 'sleep_duration_hr',
    VitalForecast
  >;
  active_alerts: MlAlert[];
  top_flag_summary: string;
  confidence_pct: number;
  data_quality_pct: number;
  imputed_fields: string[];
  model_version: string;
  [key: string]: unknown;
}

export interface TwinProjection {
  skeletal_risk_projection: {
    status: string;
    warning_in_days: number | null;
    projected_bmd: number;
    adherence_pct: number;
    adherence_factor: number;
    horizon_days: number;
    uncoupling_delta: number;
    method: string;
    note: string;
    regions: Record<
      'femoral' | 'lumbar',
      {
        today_bmd: number;
        projected_bmd: number;
        rate_per_day: number;
        status_today: string;
        status_projected: string;
        warning_in_days: number | null;
        critical_in_days: number | null;
      }
    >;
  };
  cardiovascular: Record<string, unknown>;
  dermal: Record<string, unknown>;
}

export interface MlHealth {
  status: string;
  models_loaded: boolean;
  [key: string]: unknown;
}

export const ml = {
  health: () => request<MlHealth>('/api/v1/health'),
  infer: (body: { crew_id: string; crew_code: string; baseline: MlBaseline; steps: MlTelemetry[] }) =>
    request<MlInference>('/api/v1/infer', body),
  twin: (body: {
    crew_id: string;
    adherence_pct: number;
    horizon_days?: number;
    femoral_bmd: number;
    lumbar_bmd: number;
    cardiac_anomaly_prob?: number | null;
  }) => request<TwinProjection>('/api/v1/twin/projection', body),
  suit: (body: Record<string, unknown>) => request<Record<string, unknown>>('/api/v1/suit/evaluate', body),
};
