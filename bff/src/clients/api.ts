import { identity } from '../security.js';
import { config } from '../config.js';

/** Error carrying the core API's HTTP status and body back to the BFF caller. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Core API responded ${status}`);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const user = identity.getStore();
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(path.endsWith('/assistant/run') ? 60000 : 15000),
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '',
        'x-actor': user?.name ?? 'internal',
        'x-role': user?.role ?? 'operator',
        'x-crew': user?.crew ?? '',
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new ApiError(503, {
      error: 'Core API unreachable',
      detail: (err as Error).message,
    });
  }
  const body =
    res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
const enc = encodeURIComponent;

export interface CrewMember {
  id: string;
  slug: string;
  name: string;
  role: string;
  initials: string | null;
  baseline_code: string | null;
}

export interface Vital {
  id: number;
  recorded_at: string;
  heart_rate: number | null;
  spo2: number | null;
  eda: number | null;
  [key: string]: unknown;
}

export interface NewVital {
  heartRate?: number;
  spo2?: number;
  eda?: number;
  recordedAt?: string;
}

export interface AlertRow {
  id: number;
  crew_id: string;
  crew_name: string;
  kind: string;
  source: string;
  title: string;
  detail: string;
  value: string | null;
  severity: 'info' | 'warning' | 'critical';
  state: string;
  model_derived: boolean;
  contributions: { label: string; pct: number }[];
  explanation: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

/** CockpitStateResponse from the core API (see server/src/services/telemetry.ts#crewState). */
export interface CrewState {
  crew_id: string;
  crew: {
    id: string;
    uuid: string;
    name: string;
    role: string;
    initials: string | null;
  };
  recorded_at: string | null;
  inference_current: boolean;
  vitals_current: {
    hr_bpm: number;
    spo2_pct: number;
    eda_us: number | null;
    hrv_rmssd_ms: number | null;
    sleep_duration_hr: number | null;
  } | null;
  crew_status_badge: 'Nominal' | 'Warning' | 'Critical' | null;
  fusion_outputs: {
    anomaly_score: number;
    recovery_score: number;
    stress_score: number;
  } | null;
  why_explanation: string | null;
  modality_attributions_pct: Record<string, number> | null;
  model_alerts: string[];
  active_alerts: Omit<AlertRow, 'crew_id' | 'crew_name'>[];
  open_alerts_count: number;
  hr_24h_bars: number[];
  strain_markers: { Sleep: number; Workload: number };
  [key: string]: unknown;
}

export const api = {
  health: () => request<{ status: string; db: string; ml: string }>('/health'),
  mlHealth: () =>
    request<{ status: string; models_loaded: boolean; [k: string]: unknown }>(
      '/ml/health',
    ),

  roster: () => request<CrewMember[]>('/crew'),
  getCrewMember: (crewId: string) =>
    request<CrewMember>(`/crew/${enc(crewId)}`),
  getVitals: (crewId: string, limit = 50) =>
    request<Vital[]>(`/crew/${enc(crewId)}/vitals?limit=${limit}`),
  addVital: (crewId: string, vital: NewVital) =>
    request<Vital>(`/crew/${enc(crewId)}/vitals`, json('POST', vital)),

  ingest: (
    crewId: string,
    telemetry: Record<string, unknown>,
    source: 'pulse' | 'cockpit',
  ) =>
    request<CrewState>(
      `/crew/${enc(crewId)}/telemetry?source=${source}`,
      json('POST', telemetry),
    ),
  state: (crewId: string) => request<CrewState>(`/crew/${enc(crewId)}/state`),
  analytics: (crewId: string, metric: string, window: string) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/analytics?metric=${enc(metric)}&window=${enc(window)}`,
    ),
  twin: (crewId: string, adherence?: number) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/twin${adherence === undefined ? '' : `?adherence=${adherence}`}`,
    ),
  baseline: (crewId: string) =>
    request<Record<string, unknown>>(`/crew/${enc(crewId)}/baseline`),
  updateBaseline: (crewId: string, patch: Record<string, number>) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/baseline`,
      json('PUT', patch),
    ),
  addLog: (
    crewId: string,
    log: { kind: string; label: string; detail?: string; event_id?: string },
  ) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/logs`,
      json('POST', log),
    ),
  setAlertState: (crewId: string, alertId: number, state: string) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/alerts/${alertId}`,
      json('PATCH', { state }),
    ),
  suit: (crewId: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      `/crew/${enc(crewId)}/suit/evaluate`,
      json('POST', body),
    ),

  alerts: (state: 'active' | 'all' = 'active', limit = 100) =>
    request<AlertRow[]>(`/alerts?state=${state}&limit=${limit}`),
  mission: () => request<Record<string, unknown>>('/mission'),
  updateMission: (patch: Record<string, unknown>) =>
    request<Record<string, unknown>>('/mission', json('PUT', patch)),
  countermeasures: () => request<Record<string, unknown>[]>('/countermeasures'),
  addCountermeasure: (body: {
    label: string;
    crew_id?: string;
    source?: string;
    scheduled_for?: string;
  }) =>
    request<Record<string, unknown>>('/countermeasures', json('POST', body)),
  setCountermeasure: (id: number, done: boolean) =>
    request<Record<string, unknown>>(
      `/countermeasures/${id}`,
      json('PATCH', { done }),
    ),
};
