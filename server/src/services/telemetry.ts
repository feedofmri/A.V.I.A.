import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import type { Db } from "../db/pool.js";
import {
  ml,
  MlError,
  type MlAlert,
  type MlInference,
  type MlTelemetry,
  type TwinProjection,
} from "../clients/ml.js";
import { HttpError } from "../errors.js";
import {
  getBaseline,
  resolveCrew,
  toMlBaseline,
  type Baseline,
  type CrewRef,
} from "./crew.js";
import { getMission } from "./mission.js";

/** PulseTelemetryRequest fields (AIVI_model_to_UI.docx §3.2). Only hr_bpm and spo2_pct are required here; the
 *  Pulse contract (BFF) additionally requires eda/rmssd/sleep, while the Cockpit's quick-entry modal may omit them. */
export interface TelemetryInput {
  event_id?: string;
  input_origin?: "manual" | "csv" | "scenario";
  hr_bpm: number;
  spo2_pct: number;
  eda_tonic_us?: number;
  hrv_rmssd_ms?: number;
  hrv_sdnn_ms?: number;
  resp_rate_bpm?: number;
  scr_peaks_min?: number;
  skin_temp_c?: number;
  sleep_duration_hr?: number;
  eeg_delta_rel?: number;
  eeg_theta_rel?: number;
  eeg_sigma_rel?: number;
  eeg_beta_rel?: number;
  eog_std_uv?: number;
  mission_day?: number | string;
  mission_timepoint?: string;
  recorded_at?: string;
}

export type ReadingSource = "pulse" | "cockpit" | "api" | "seed";

export interface VitalRow {
  input_payload?: TelemetryInput;
  baseline_version?: number;
  inference_status?: string;
  id: number;
  recorded_at: Date;
  heart_rate: number;
  spo2: number;
  eda: number | null;
  hrv_rmssd_ms: number | null;
  hrv_sdnn_ms: number | null;
  resp_rate_bpm: number | null;
  scr_peaks_min: number | null;
  skin_temp_c: number | null;
  sleep_duration_hr: number | null;
  eeg_delta_rel: number | null;
  eeg_theta_rel: number | null;
  eeg_sigma_rel: number | null;
  eeg_beta_rel: number | null;
  eog_std_uv: number | null;
  mission_day: number | null;
  mission_timepoint: string | null;
  source: string;
  imputed_fields: string[];
}

export const TELEMETRY_SCHEMA = {
  type: "object",
  required: ["hr_bpm", "spo2_pct"],
  properties: {
    event_id: { type: "string", minLength: 8, maxLength: 128 },
    input_origin: { type: "string", enum: ["manual", "csv", "scenario"] },
    hr_bpm: { type: "number", minimum: 40, maximum: 180 },
    spo2_pct: { type: "number", minimum: 70, maximum: 100 },
    eda_tonic_us: { type: "number", minimum: 0.05, maximum: 40 },
    hrv_rmssd_ms: { type: "number", minimum: 5, maximum: 150 },
    hrv_sdnn_ms: { type: "number", minimum: 10, maximum: 200 },
    resp_rate_bpm: { type: "number", minimum: 6, maximum: 45 },
    scr_peaks_min: { type: "number", minimum: 0, maximum: 120 },
    skin_temp_c: { type: "number", minimum: 25, maximum: 41 },
    sleep_duration_hr: { type: "number", minimum: 0, maximum: 12 },
    eeg_delta_rel: { type: "number", minimum: 0, maximum: 1 },
    eeg_theta_rel: { type: "number", minimum: 0, maximum: 1 },
    eeg_sigma_rel: { type: "number", minimum: 0, maximum: 1 },
    eeg_beta_rel: { type: "number", minimum: 0, maximum: 1 },
    eog_std_uv: { type: "number", minimum: 0, maximum: 500 },
    mission_day: {
      anyOf: [
        { type: "integer", minimum: 1, maximum: 1000 },
        {
          type: "string",
          pattern:
            "^(L-92|L-44|L-3|R\\+1|R\\+45|R\\+82|R\\+194|[1-9][0-9]{0,2}|1000)$",
        },
      ],
    },
    mission_timepoint: {
      type: "string",
      enum: ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"],
    },
    recorded_at: { type: "string", format: "date-time" },
  },
} as const;

const HOUR = 3_600_000;
const STEP_MS = 12 * HOUR; // the GRU's 6-step window is 72 h
const WINDOW_STEPS = 6;
const EEG = [
  "eeg_delta_rel",
  "eeg_theta_rel",
  "eeg_sigma_rel",
  "eeg_beta_rel",
  "eog_std_uv",
] as const;
const MODEL_ALERT_KINDS = ["sleep", "stress", "cardiac", "hypoxia", "anomaly"];

interface Completed {
  t: Required<
    Pick<
      TelemetryInput,
      | "hr_bpm"
      | "spo2_pct"
      | "eda_tonic_us"
      | "hrv_rmssd_ms"
      | "hrv_sdnn_ms"
      | "resp_rate_bpm"
      | "scr_peaks_min"
      | "skin_temp_c"
      | "sleep_duration_hr"
    >
  > & {
    eeg: Record<(typeof EEG)[number], number | null>;
    mission_day: number | null;
    mission_timepoint: string | null;
  };
  imputed: string[];
}

/**
 * Fills fields a client did not send. Slow-moving values (EDA, HRV, last night's sleep, EEG) carry forward from the
 * crew member's previous reading, then fall back to the personal baseline; the rest use the documented defaults
 * (SDNN = RMSSD x 1.15, resp 16, SCR 15, skin temp 33.9). Every filled field is recorded in imputed_fields.
 */
export function completeTelemetry(
  input: TelemetryInput,
  last: VitalRow | undefined,
  b: Baseline,
  missionDay: number,
): Completed {
  const imputed: string[] = [];
  const pick = (
    key: keyof TelemetryInput,
    carried: number | null | undefined,
    fallback: number,
  ): number => {
    const v = input[key];
    if (typeof v === "number") return v;
    imputed.push(key);
    return carried ?? fallback;
  };
  const rmssd = pick("hrv_rmssd_ms", last?.hrv_rmssd_ms, b.rmssd_ms);
  const t = {
    hr_bpm: input.hr_bpm,
    spo2_pct: input.spo2_pct,
    eda_tonic_us: pick("eda_tonic_us", last?.eda, b.eda_us),
    hrv_rmssd_ms: rmssd,
    hrv_sdnn_ms: pick(
      "hrv_sdnn_ms",
      undefined,
      Math.max(10, Math.min(200, rmssd * 1.15)),
    ),
    resp_rate_bpm: pick("resp_rate_bpm", undefined, 16.0),
    scr_peaks_min: pick("scr_peaks_min", undefined, 15.0),
    skin_temp_c: pick("skin_temp_c", undefined, 33.9),
    sleep_duration_hr: pick(
      "sleep_duration_hr",
      last?.sleep_duration_hr,
      b.sleep_hr,
    ),
    eeg: {} as Completed["t"]["eeg"],
    mission_day: null as number | null,
    mission_timepoint: null as string | null,
  };
  for (const k of EEG) {
    if (typeof input[k] === "number") t.eeg[k] = input[k] as number;
    else {
      // Carried forward, or left null so the inference service derives it from sleep duration.
      t.eeg[k] =
        input.sleep_duration_hr !== undefined &&
        input.sleep_duration_hr !== last?.sleep_duration_hr
          ? null
          : (last?.[k] ?? null);
      imputed.push(k);
    }
  }
  const md = input.mission_day;
  if (typeof md === "number" || (typeof md === "string" && /^\d+$/.test(md)))
    t.mission_day = Number(md);
  else if (typeof md === "string") t.mission_timepoint = md;
  if (input.mission_timepoint) t.mission_timepoint = input.mission_timepoint;
  if (t.mission_day === null && t.mission_timepoint === null) {
    t.mission_day = missionDay;
  }
  return { t, imputed };
}

/** Only called for rows that passed historySteps(), so eda / rmssd / sleep are present. */
export function rowToMl(r: VitalRow): MlTelemetry {
  return {
    hr_bpm: r.heart_rate,
    spo2_pct: r.spo2,
    eda_tonic_us: r.eda as number,
    hrv_rmssd_ms: r.hrv_rmssd_ms as number,
    sleep_duration_hr: r.sleep_duration_hr as number,
    hrv_sdnn_ms: r.hrv_sdnn_ms,
    resp_rate_bpm: r.resp_rate_bpm ?? undefined,
    scr_peaks_min: r.scr_peaks_min ?? undefined,
    skin_temp_c: r.skin_temp_c ?? undefined,
    eeg_delta_rel: r.eeg_delta_rel,
    eeg_theta_rel: r.eeg_theta_rel,
    eeg_sigma_rel: r.eeg_sigma_rel,
    eeg_beta_rel: r.eeg_beta_rel,
    eog_std_uv: r.eog_std_uv,
    mission_day: r.mission_day,
    mission_timepoint: r.mission_timepoint,
  };
}

/** One reading per 12 h slot over the 60 h before `at` (oldest first). Missing slots are skipped; the inference
 *  service pads the front of the window with the personal-baseline state. */
export function historySteps(recent: VitalRow[], at: Date): VitalRow[] {
  const slots = new Map<number, VitalRow>();
  for (const r of recent) {
    if (r.hrv_rmssd_ms == null || r.eda == null || r.sleep_duration_hr == null)
      continue; // legacy partial rows
    const slot = Math.round((at.getTime() - r.recorded_at.getTime()) / STEP_MS);
    if (slot < 1 || slot >= WINDOW_STEPS) continue;
    const prev = slots.get(slot);
    if (!prev || r.recorded_at > prev.recorded_at) slots.set(slot, r);
  }
  return [...slots.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r);
}

async function sync(
  c: pg.PoolClient,
  crewId: string,
  at: Date,
  inferenceId: number | null,
  kinds: string[],
  candidates: MlAlert[],
  isSeed: boolean,
) {
  const { rows: active } = await c.query<{ id: number; kind: string }>(
    `SELECT id, kind FROM alerts WHERE state <> 'resolved' AND model_derived AND kind = ANY($1)`,
    [kinds],
  );
  const byKind = new Map(active.map((a) => [a.kind, a.id]));
  for (const a of candidates) {
    const params = [
      a.title,
      a.detail,
      a.value,
      a.status,
      JSON.stringify(a.contributions),
      a.explanation,
      inferenceId,
      at,
    ];
    const id = byKind.get(a.kind);
    if (id) {
      await c.query(
        `UPDATE alerts SET title = $1, detail = $2, value = $3, severity = $4, contributions = $5, explanation = $6,
                inference_id = $7, last_seen_at = $8 WHERE id = $9`,
        [...params, id],
      );
      byKind.delete(a.kind);
    } else {
      await c.query(
        `INSERT INTO alerts (title, detail, value, severity, contributions, explanation, inference_id, first_seen_at,
                             last_seen_at, crew_id, kind, source, model_derived, is_seed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, true, $12)`,
        [...params, crewId, a.kind, a.source, isSeed],
      );
    }
  }
  // Conditions that no longer hold are resolved automatically.
  for (const id of byKind.values()) {
    await c.query(
      `UPDATE alerts SET state = 'resolved', resolved_at = $1 WHERE id = $2`,
      [at, id],
    );
  }
}

/** Bone-model alert from the skeletal heuristic bridge at the crew member's stored countermeasure adherence. */
export function boneAlert(
  twin: TwinProjection,
  explanationPrefix = "",
): MlAlert | null {
  const s = twin.skeletal_risk_projection;
  const region = (["femoral", "lumbar"] as const)
    .map((k) => ({ k, r: s.regions[k] }))
    .filter(
      ({ r }) =>
        r.warning_in_days !== null && r.warning_in_days <= s.horizon_days,
    )
    .sort((a, b) => a.r.warning_in_days! - b.r.warning_in_days!)[0];
  if (!region) return null;
  const name = region.k === "femoral" ? "Femoral neck" : "Lumbar spine L1–L4";
  const when =
    region.r.warning_in_days === 0 ? "now" : `in ${region.r.warning_in_days} d`;
  // The loss rate is base x (1 + uncoupling) x adherence_factor; split the excess over base by each factor's log share.
  const logs = {
    "OSD-919 uncoupling": Math.abs(Math.log1p(s.uncoupling_delta)),
    Adherence: Math.abs(Math.log(s.adherence_factor)),
  };
  const total = logs["OSD-919 uncoupling"] + logs.Adherence || 1;
  return {
    kind: "bone",
    source: "BONE MODEL",
    title: `${name} BMD reaches warning ${when}`,
    detail: `${name} ${region.r.today_bmd.toFixed(3)} g/cm² today, projected ${region.r.projected_bmd.toFixed(3)} g/cm² at +${s.horizon_days} d (adherence ${s.adherence_pct.toFixed(0)}%)`,
    value: `${region.r.today_bmd.toFixed(3)} g/cm²`,
    rule: "Skeletal heuristic bridge: projected BMD crosses warning within the 60-day horizon",
    status: region.r.status_today === "Critical" ? "critical" : "warning",
    model_derived: true,
    contributions: Object.entries(logs)
      .map(([label, v]) => ({
        label,
        pct: Math.round((1000 * v) / total) / 10,
      }))
      .sort((a, b) => b.pct - a.pct),
    explanation:
      `${explanationPrefix}${s.note} Skeletal_Stem_Cells uncoupling_delta ${s.uncoupling_delta >= 0 ? "+" : ""}${s.uncoupling_delta.toFixed(4)}; ` +
      `loss rate ${(region.r.rate_per_day * 1000).toFixed(3)} mg/cm²/day at ${s.adherence_pct.toFixed(0)}% countermeasure adherence.`,
  };
}

export interface IngestResult {
  status: 201 | 202;
  body: Record<string, unknown>;
}

/** Validate → persist the reading → run the A.V.I.A. models → persist inference + alerts → return CockpitState. */
export async function ingestTelemetry(
  db: Db,
  crewRef: string,
  input: TelemetryInput,
  source: ReadingSource,
  opts: { returnState?: boolean; seed?: boolean } = {},
): Promise<IngestResult> {
  const crew = await resolveCrew(db, crewRef);
  if (!crew.baseline_code)
    throw new HttpError(409, "No reference context configured");
  const at = input.recorded_at ? new Date(input.recorded_at) : new Date();
  if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 300000)
    throw new HttpError(
      422,
      "Timestamp must be valid and no more than five minutes in the future",
    );
  const eventId =
    input.event_id ??
    (input.recorded_at
      ? createHash("sha256")
          .update(JSON.stringify(Object.entries(input).sort()))
          .digest("hex")
      : randomUUID());
  const mission = await getMission(db);
  const accepted = await db.withCrew(crew.id, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [crew.id]);
    const existing = (
      await c.query<{ id: number; input_payload: TelemetryInput }>(
        "SELECT id,input_payload FROM vitals WHERE event_id=$1",
        [eventId],
      )
    ).rows[0];
    if (existing) {
      const canonical = (v: TelemetryInput) =>
        JSON.stringify(
          Object.entries(v)
            .filter(([k]) => k !== "event_id")
            .sort(),
        );
      if (canonical(existing.input_payload) !== canonical(input))
        throw new HttpError(
          409,
          "Event identifier already belongs to a different payload",
        );
      return { id: existing.id, duplicate: true };
    }
    const baseline = await getBaseline(c, crew);
    const last = (
      await c.query<VitalRow>(
        "SELECT * FROM vitals WHERE recorded_at <= $1 ORDER BY recorded_at DESC,id DESC LIMIT 1",
        [at],
      )
    ).rows[0];
    const carried =
      last && at.getTime() - last.recorded_at.getTime() <= 24 * HOUR
        ? last
        : undefined;
    const { t, imputed } = completeTelemetry(
      input,
      carried,
      baseline,
      mission.mission_day,
    );
    const row = await c.query<{ id: number }>(
      `INSERT INTO vitals (crew_id,recorded_at,heart_rate,spo2,eda,hrv_rmssd_ms,hrv_sdnn_ms,resp_rate_bpm,scr_peaks_min,skin_temp_c,sleep_duration_hr,eeg_delta_rel,eeg_theta_rel,eeg_sigma_rel,eeg_beta_rel,eog_std_uv,mission_day,mission_timepoint,source,imputed_fields,event_id,input_payload,inference_status,baseline_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'pending',$23) RETURNING id`,
      [
        crew.id,
        at,
        t.hr_bpm,
        t.spo2_pct,
        t.eda_tonic_us,
        t.hrv_rmssd_ms,
        t.hrv_sdnn_ms,
        t.resp_rate_bpm,
        t.scr_peaks_min,
        t.skin_temp_c,
        t.sleep_duration_hr,
        t.eeg.eeg_delta_rel,
        t.eeg.eeg_theta_rel,
        t.eeg.eeg_sigma_rel,
        t.eeg.eeg_beta_rel,
        t.eeg.eog_std_uv,
        t.mission_day,
        t.mission_timepoint,
        source,
        imputed,
        eventId,
        JSON.stringify(input),
        baseline.version,
      ],
    );
    return { id: row.rows[0].id, duplicate: false };
  });
  const scored = await processVital(db, crew, accepted.id, opts.seed ?? false);
  const state = opts.returnState === false ? {} : await crewState(db, crew);
  return {
    status: scored ? 201 : 202,
    body: {
      ...state,
      accepted: true,
      event_id: eventId,
      submitted_vital_id: accepted.id,
      duplicate: accepted.duplicate,
      processing_status: scored ? "scored" : "pending",
      vital_persisted: true,
    },
  };
}

export async function processVital(
  db: Db,
  crew: CrewRef,
  vitalId: number,
  isSeed = false,
): Promise<boolean> {
  const snapshot = await db.withCrew(crew.id, async (c) => {
    const vital = (
      await c.query<VitalRow & { inference_status: string }>(
        "SELECT * FROM vitals WHERE id=$1",
        [vitalId],
      )
    ).rows[0];
    if (!vital) return null;
    const baseline = await getBaseline(c, crew);
    const existing = (
      await c.query(
        "SELECT id,baseline_version,result->>'policy_version' AS policy_version FROM inferences WHERE vital_id=$1",
        [vitalId],
      )
    ).rows[0];
    const recent = (
      await c.query<VitalRow>(
        "SELECT * FROM vitals WHERE recorded_at < $1 AND recorded_at >= $1 - interval '72 hours' ORDER BY recorded_at DESC,id DESC",
        [vital.recorded_at],
      )
    ).rows;
    return { vital, baseline, existing, recent };
  });
  if (!snapshot) return false;
  const { vital, baseline, existing, recent } = snapshot;
  if (
    existing?.baseline_version === baseline.version &&
    existing.policy_version === "software-1"
  )
    return true;
  try {
    const current = rowToMl(vital);
    // Preserve each 12-hour position. Missing slots use the personal baseline and are identified separately.
    const history = historySteps(recent, vital.recorded_at);
    const steps: MlTelemetry[] = [];
    let observed = 1;
    for (let slot = 5; slot >= 1; slot--) {
      const found = history.find(
        (r) =>
          Math.round(
            (vital.recorded_at.getTime() - r.recorded_at.getTime()) / STEP_MS,
          ) === slot,
      );
      if (found) {
        steps.push(rowToMl(found));
        observed++;
      } else
        steps.push({
          hr_bpm: baseline.hr_bpm,
          spo2_pct: baseline.spo2_pct,
          eda_tonic_us: baseline.eda_us,
          hrv_rmssd_ms: baseline.rmssd_ms,
          sleep_duration_hr: baseline.sleep_hr,
          mission_timepoint: "L-3",
        });
    }
    const inference = await ml.infer({
      crew_id: crew.slug,
      crew_code: crew.baseline_code!,
      baseline: toMlBaseline(baseline),
      steps: [...steps, current],
    });
    const twin = await ml.twin({
      crew_id: crew.slug,
      adherence_pct: baseline.adherence_pct,
      femoral_bmd: baseline.femoral_bmd,
      lumbar_bmd: baseline.lumbar_bmd,
      cardiac_anomaly_prob: inference.encoder_outputs.cardiac_anomaly_prob,
    });
    const bone = boneAlert(twin);
    const rank: Record<string, number> = {
      Nominal: 0,
      Warning: 1,
      Critical: 2,
    };
    if (
      bone &&
      rank[inference.crew_status_badge] < (bone.status === "critical" ? 2 : 1)
    )
      inference.crew_status_badge =
        bone.status === "critical" ? "Critical" : "Warning";
    const result = {
      ...inference,
      skeletal_risk_projection: twin.skeletal_risk_projection,
      baseline_version: baseline.version,
      policy_version: "software-1",
      observed_history_steps: observed,
      imputed_fields: vital.imputed_fields,
    };
    return await db.withCrew(crew.id, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [crew.id]);
      const nowBaseline = await getBaseline(c, crew);
      if (nowBaseline.version !== baseline.version) return false;
      const inf = await c.query<{ id: number }>(
        `INSERT INTO inferences (crew_id,vital_id,recorded_at,model_version,crew_status_badge,anomaly_score,recovery_score,stress_score,cardiac_anomaly_prob,stress_probability,recovery_index,predicted_sleep_stage,z_scores,attributions,result,baseline_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(vital_id) DO UPDATE SET crew_status_badge=EXCLUDED.crew_status_badge,anomaly_score=EXCLUDED.anomaly_score,recovery_score=EXCLUDED.recovery_score,stress_score=EXCLUDED.stress_score,cardiac_anomaly_prob=EXCLUDED.cardiac_anomaly_prob,stress_probability=EXCLUDED.stress_probability,recovery_index=EXCLUDED.recovery_index,predicted_sleep_stage=EXCLUDED.predicted_sleep_stage,z_scores=EXCLUDED.z_scores,attributions=EXCLUDED.attributions,result=EXCLUDED.result,baseline_version=EXCLUDED.baseline_version RETURNING id`,
        [
          crew.id,
          vitalId,
          vital.recorded_at,
          inference.model_version,
          inference.crew_status_badge,
          inference.fusion_outputs.anomaly_score,
          inference.fusion_outputs.recovery_score,
          inference.fusion_outputs.stress_score,
          inference.encoder_outputs.cardiac_anomaly_prob,
          inference.encoder_outputs.stress_probability,
          inference.encoder_outputs.recovery_index,
          inference.encoder_outputs.predicted_sleep_stage,
          JSON.stringify(inference.personal_z_scores),
          JSON.stringify(inference.modality_attributions_pct),
          JSON.stringify(result),
          baseline.version,
        ],
      );
      await c.query(
        "UPDATE vitals SET inference_status='scored',inference_error=NULL,baseline_version=$2 WHERE id=$1",
        [vitalId, baseline.version],
      );
      const latest = (
        await c.query(
          "SELECT id FROM vitals ORDER BY recorded_at DESC,id DESC LIMIT 1",
        )
      ).rows[0];
      if (latest.id === vitalId) {
        await sync(
          c,
          crew.id,
          vital.recorded_at,
          inf.rows[0].id,
          MODEL_ALERT_KINDS,
          inference.active_alerts,
          isSeed,
        );
        await sync(
          c,
          crew.id,
          vital.recorded_at,
          inf.rows[0].id,
          ["bone"],
          bone ? [bone] : [],
          isSeed,
        );
      }
      return true;
    });
  } catch (err) {
    if (!(err instanceof MlError)) throw err;
    await db.withCrew(crew.id, (c) =>
      c.query(
        "UPDATE vitals SET inference_status=$2,inference_error=$3,attempts=attempts+1,next_attempt_at=now()+(LEAST(300,power(2,LEAST(attempts,6))*5)*interval '1 second') WHERE id=$1",
        [vitalId, err.status === 422 ? "failed" : "pending", err.message],
      ),
    );
    return false;
  }
}

async function latestVital(
  db: Db,
  crew: CrewRef,
  before: Date,
): Promise<VitalRow | undefined> {
  return db.withCrew(
    crew.id,
    async (c) =>
      (
        await c.query<VitalRow>(
          "SELECT * FROM vitals WHERE recorded_at < $1 ORDER BY recorded_at DESC, id DESC LIMIT 1",
          [before],
        )
      ).rows[0],
  );
}

/** Hourly mean HR over the 24 h ending at `end`; empty hours carry the previous value forward. The final bar is the
 *  current reading itself (AIVI doc: "the final bright-blue bar representing the current reading"). */
async function hr24(
  c: pg.PoolClient,
  end: Date,
  fallback: number,
  current: number,
): Promise<number[]> {
  const { rows } = await c.query<{ heart_rate: number; recorded_at: Date }>(
    `SELECT heart_rate, recorded_at FROM vitals
      WHERE recorded_at > $1::timestamptz - interval '24 hours' AND recorded_at <= $1 ORDER BY recorded_at`,
    [end],
  );
  const before = await c.query<{ heart_rate: number }>(
    `SELECT heart_rate FROM vitals WHERE recorded_at <= $1::timestamptz - interval '24 hours'
      ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    [end],
  );
  const start = end.getTime() - 24 * HOUR;
  const sums = Array.from({ length: 24 }, () => ({ s: 0, n: 0 }));
  for (const r of rows) {
    const i = Math.min(
      23,
      Math.floor((r.recorded_at.getTime() - start) / HOUR),
    );
    sums[i].s += r.heart_rate;
    sums[i].n += 1;
  }
  let prev = before.rows[0]?.heart_rate ?? fallback;
  const bars = sums.map(({ s, n }) => (prev = n ? Math.round(s / n) : prev));
  bars[23] = Math.round(current);
  return bars;
}

async function strainMarkers(
  c: pg.PoolClient,
): Promise<{ Sleep: number; Workload: number }> {
  // Distinct days in the last 7 with reduced recovery (Sleep_z < -1.5) or elevated stress (stress_score > 0.60).
  const { rows } = await c.query<{ sleep: number; workload: number }>(
    `SELECT count(DISTINCT date_trunc('day', recorded_at)) FILTER (WHERE (z_scores->>'Sleep_z')::float < -1.5) AS sleep,
            count(DISTINCT date_trunc('day', recorded_at)) FILTER (WHERE stress_score > 0.60) AS workload
       FROM inferences WHERE recorded_at > now() - interval '7 days'`,
  );
  return { Sleep: rows[0]?.sleep ?? 0, Workload: rows[0]?.workload ?? 0 };
}

export interface AlertRow {
  id: number;
  kind: string;
  source: string;
  title: string;
  detail: string;
  value: string | null;
  severity: "info" | "warning" | "critical";
  state: string;
  model_derived: boolean;
  contributions: { label: string; pct: number }[];
  explanation: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  resolved_at: Date | null;
}

export async function activeAlerts(c: pg.PoolClient): Promise<AlertRow[]> {
  const { rows } = await c.query<AlertRow>(
    `SELECT id, kind, source, title, detail, value, severity, state, model_derived, contributions, explanation,
            first_seen_at, last_seen_at, resolved_at
       FROM alerts WHERE state <> 'resolved' ORDER BY last_seen_at DESC`,
  );
  return rows;
}

/** CockpitStateResponse: the latest model run for a crew member plus everything the Cockpit views read. */
export async function crewState(
  db: Db,
  crew: CrewRef,
): Promise<Record<string, unknown>> {
  return db.withCrew(crew.id, async (c) => {
    const vital = (
      await c.query<VitalRow>(
        "SELECT * FROM vitals ORDER BY recorded_at DESC, id DESC LIMIT 1",
      )
    ).rows[0];
    const inf = (
      await c.query<{
        id: number;
        vital_id: number;
        recorded_at: Date;
        baseline_version: number;
        result: MlInference & { skeletal_risk_projection: unknown };
      }>(
        "SELECT id, vital_id, recorded_at, baseline_version, result FROM inferences ORDER BY recorded_at DESC, vital_id DESC, id DESC LIMIT 1",
      )
    ).rows[0];
    const baseline = (
      await c.query<Baseline>(
        "SELECT * FROM crew_baselines WHERE crew_id = $1",
        [crew.id],
      )
    ).rows[0];
    const alerts = await activeAlerts(c);
    const end = vital?.recorded_at ?? new Date();
    const fresh = Boolean(
      inf &&
      vital &&
      inf.vital_id === vital.id &&
      inf.baseline_version === baseline?.version &&
      (inf.result as MlInference & { policy_version?: string })
        .policy_version === "software-1" &&
      Date.now() - vital.recorded_at.getTime() < 24 * HOUR,
    );
    const r = fresh ? inf?.result : undefined;
    return {
      crew_id: crew.slug,
      crew: {
        id: crew.slug,
        uuid: crew.id,
        name: crew.name,
        role: crew.role,
        initials: crew.initials,
        baseline_code: crew.baseline_code,
      },
      recorded_at: vital?.recorded_at ?? null,
      vital_id: vital?.id ?? null,
      inference_id: inf?.id ?? null,
      inference_recorded_at: inf?.recorded_at ?? null,
      // false when the newest reading could not be scored (inference service down at ingest time)
      inference_current: fresh,
      inference_status: fresh
        ? "scored"
        : ((vital as any)?.inference_status ?? "unknown"),
      measurement_age_seconds: vital
        ? Math.max(
            0,
            Math.floor((Date.now() - vital.recorded_at.getTime()) / 1000),
          )
        : null,
      baseline_version: baseline?.version ?? null,
      imputed_fields: vital?.imputed_fields ?? [],
      provenance: {
        input: vital?.input_payload?.input_origin ?? vital?.source ?? "unknown",
        forecasts: "experimental_extrapolation",
        bone: "heuristic_bridge",
        context: "NASA_reference_subject",
      },
      vitals_current: vital
        ? {
            hr_bpm: vital.heart_rate,
            spo2_pct: vital.spo2,
            eda_us: vital.eda,
            hrv_rmssd_ms: vital.hrv_rmssd_ms,
            sleep_duration_hr: vital.sleep_duration_hr,
            resp_rate_bpm: vital.resp_rate_bpm,
            skin_temp_c: vital.skin_temp_c,
            source: vital.input_payload?.input_origin ?? vital.source,
          }
        : null,
      crew_status_badge: r?.crew_status_badge ?? null,
      fusion_outputs: r?.fusion_outputs ?? null,
      encoder_outputs: r?.encoder_outputs ?? null,
      personal_z_scores: r?.personal_z_scores ?? null,
      modality_attributions_pct: r?.modality_attributions_pct ?? null,
      modality_mask: r?.modality_mask ?? null,
      why_explanation: r?.why_explanation ?? null,
      top_flag_summary: r?.top_flag_summary ?? null,
      analytics_forecast_7step: r?.analytics_forecast_7step ?? null,
      trajectory: r?.trajectory ?? null,
      skeletal_risk_projection: r?.skeletal_risk_projection ?? null,
      confidence_pct: null,
      data_quality_pct: r?.data_quality_pct ?? null,
      model_version: r?.model_version ?? null,
      model_alerts: r?.active_alerts?.map((a) => a.title) ?? [],
      active_alerts: alerts,
      open_alerts_count: alerts.length,
      hr_24h_bars: vital
        ? await hr24(
            c,
            end,
            baseline?.hr_bpm ?? vital.heart_rate,
            vital.heart_rate,
          )
        : [],
      strain_markers: await strainMarkers(c),
      personal_baseline: baseline ?? null,
    };
  });
}
