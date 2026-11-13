import type { Db } from "../db/pool.js";
import { ml, type MlInference } from "../clients/ml.js";
import { HttpError, notFound } from "../errors.js";
import { getBaseline, resolveCrew, roster, type CrewRef } from "./crew.js";
import type { AlertRow } from "./telemetry.js";

// ------------------------------------------------------------------ alerts

export type AlertWithCrew = AlertRow & { crew_id: string; crew_name: string };

/** Alerts across the whole crew. RLS scopes each query to one crew member, so this runs one transaction per member. */
export async function listAlerts(
  db: Db,
  opts: { state: "active" | "all"; crew?: string; limit: number },
): Promise<AlertWithCrew[]> {
  const members = opts.crew
    ? [await resolveCrew(db, opts.crew)]
    : await roster(db);
  const perCrew = await Promise.all(
    members.map((m) =>
      db.withCrew(m.id, async (c) => {
        const { rows } = await c.query<AlertRow>(
          `SELECT id, kind, source, title, detail, value, severity, state, model_derived, contributions, explanation,
                  first_seen_at, last_seen_at, resolved_at
             FROM alerts ${opts.state === "active" ? "WHERE state <> 'resolved'" : ""}
            ORDER BY last_seen_at DESC LIMIT $1`,
          [opts.limit],
        );
        return rows.map((r) => ({ ...r, crew_id: m.slug, crew_name: m.name }));
      }),
    ),
  );
  return perCrew
    .flat()
    .sort((a, b) => b.last_seen_at.getTime() - a.last_seen_at.getTime())
    .slice(0, opts.limit);
}

export async function setAlertState(
  db: Db,
  crewRef: string,
  alertId: number,
  state: "open" | "acknowledged" | "resolved",
) {
  const crew = await resolveCrew(db, crewRef);
  return db.withCrew(crew.id, async (c) => {
    const { rows } = await c.query(
      `UPDATE alerts SET state = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE NULL END
        WHERE id = $2 RETURNING id, state, resolved_at`,
      [state, alertId],
    );
    if (rows.length === 0) throw notFound(`Alert ${alertId} for ${crew.slug}`);
    return rows[0];
  });
}

const LOG_KINDS = {
  symptom: {
    source: "PULSE LOG",
    severity: "warning",
    title: (l: string) => `Symptom logged: ${l}`,
  },
  device: { source: "DEVICE", severity: "info", title: (l: string) => l },
  dermal_scan: {
    source: "DERMAL SCAN",
    severity: "warning",
    title: (l: string) => l,
  },
} as const;

/** Manual / device log entries (no ML involved). They appear in the Alerts feed flagged as not model-derived. */
export async function addLog(
  db: Db,
  crewRef: string,
  kind: keyof typeof LOG_KINDS,
  label: string,
  detail?: string,
  eventId?: string,
) {
  const crew = await resolveCrew(db, crewRef);
  const k = LOG_KINDS[kind];
  return db.withCrew(crew.id, async (c) => {
    const { rows } = await c.query(
      `INSERT INTO alerts (crew_id, kind, source, title, detail, severity, model_derived, explanation, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8) ON CONFLICT (crew_id,event_id) WHERE event_id IS NOT NULL DO UPDATE SET event_id=EXCLUDED.event_id RETURNING id, kind, source, title, detail, severity, state, first_seen_at`,
      [
        crew.id,
        kind,
        k.source,
        k.title(label),
        detail ?? label,
        k.severity,
        "Manual log entry recorded in Pulse; not produced by an on-board model.",
        eventId ?? null,
      ],
    );
    return rows[0];
  });
}

// ------------------------------------------------------------------ countermeasures

export async function listCountermeasures(db: Db) {
  // Today's items plus anything still undone from earlier days.
  const { rows } = await db.pool.query(
    `SELECT cm.id, cm.label, cm.done, cm.scheduled_for, cm.source, cm.completed_at, cm.completed_by, r.slug AS crew_id
       FROM countermeasures cm LEFT JOIN crew_roster() r ON r.id = cm.crew_id
      ORDER BY cm.scheduled_for, cm.id LIMIT 500`,
  );
  return rows;
}

export async function addCountermeasure(
  db: Db,
  label: string,
  crewRef: string | undefined,
  source: string,
  scheduledFor?: string,
) {
  const crew = crewRef ? await resolveCrew(db, crewRef) : null;
  const { rows } = await db.pool.query(
    `INSERT INTO countermeasures (label, crew_id, source,scheduled_for) VALUES ($1, $2, $3,COALESCE($4::date,current_date))
     ON CONFLICT (scheduled_for, label, crew_id) DO UPDATE SET updated_at = now()
     RETURNING id, label, done, scheduled_for, source, crew_id`,
    [label, crew?.id ?? null, source, scheduledFor ?? null],
  );
  return { ...rows[0], crew_id: crew?.slug ?? null };
}

export async function setCountermeasureDone(
  db: Db,
  id: number,
  done: boolean,
  actor: string = "internal",
) {
  return db.tx(async (c) => {
    const { rows } = await c.query(
      "UPDATE countermeasures SET done=$1,completed_at=CASE WHEN $1 THEN now() ELSE NULL END,completed_by=CASE WHEN $1 THEN $3 ELSE NULL END,updated_at=now() WHERE id=$2 RETURNING *",
      [done, id, actor],
    );
    if (!rows.length) throw notFound("Countermeasure " + id);
    const task = rows[0];
    if (task.crew_id) {
      await c.query("SELECT set_config('app.crew_id',$1,true)", [task.crew_id]);
      await c.query(
        "INSERT INTO task_history(task_id,crew_id,actor,done,label,scheduled_for) VALUES($1,$2,$3,$4,$5,$6)",
        [id, task.crew_id, actor, done, task.label, task.scheduled_for],
      );
    }
    return task;
  });
}

// ------------------------------------------------------------------ analytics

export const METRICS = {
  hr: { column: "heart_rate", forecast: "hr_bpm", unit: "bpm" },
  spo2: { column: "spo2", forecast: "spo2_pct", unit: "%" },
  eda: { column: "eda", forecast: "eda_tonic_us", unit: "µS" },
  hrv: { column: "hrv_rmssd_ms", forecast: "hrv_rmssd_ms", unit: "ms" },
  sleep: {
    column: "sleep_duration_hr",
    forecast: "sleep_duration_hr",
    unit: "h",
  },
} as const;

// Number of historical bars per window, so history + the 7 forecast bars keeps the Cockpit chart's 24 / 14 / 30 slots.
export const WINDOWS = {
  "24h": { bucket: "hour", interval: "24 hours", bars: 24 },
  "7d": { bucket: "day", interval: "7 days", bars: 7 },
  "30d": { bucket: "day", interval: "30 days", bars: 30 },
} as const;

export async function analytics(
  db: Db,
  crewRef: string,
  metric: keyof typeof METRICS,
  window: keyof typeof WINDOWS,
) {
  const crew = await resolveCrew(db, crewRef);
  const m = METRICS[metric];
  const w = WINDOWS[window];
  return db.withCrew(crew.id, async (c) => {
    // Window is anchored at the newest reading so the chart stays populated even if Pulse has been idle.
    const hist = await c.query<{ t: Date; value: number; n: number }>(
      `WITH latest AS (SELECT date_trunc('${w.bucket}',max(recorded_at)) AS at FROM vitals),
       buckets AS (SELECT generate_series(at-interval '${w.interval}'+interval '1 ${w.bucket}',at,interval '1 ${w.bucket}') AS t FROM latest)
       SELECT b.t,avg(v.${m.column})::float8 AS value,count(v.id)::int AS n FROM buckets b
       LEFT JOIN vitals v ON date_trunc('${w.bucket}',v.recorded_at)=b.t GROUP BY b.t ORDER BY b.t DESC`,
    );
    const latest = (
      await c.query(
        "SELECT * FROM vitals ORDER BY recorded_at DESC, id DESC LIMIT 1",
      )
    ).rows[0];
    const inf = (
      await c.query<{ recorded_at: Date; result: MlInference }>(
        "SELECT recorded_at, vital_id, baseline_version, result FROM inferences ORDER BY recorded_at DESC, vital_id DESC, id DESC LIMIT 1",
      )
    ).rows[0];

    const historical = hist.rows.reverse().map((r) => ({
      t: r.t,
      value: r.value == null ? null : Math.round(r.value * 100) / 100,
      samples: r.n,
    }));
    const currentBaseline = await getBaseline(c, crew);
    const fresh =
      inf &&
      latest &&
      (inf as any).vital_id === latest.id &&
      (inf as any).baseline_version === currentBaseline.version &&
      (inf.result as MlInference & { policy_version?: string })
        .policy_version === "software-1" &&
      Date.now() - new Date(inf.recorded_at).getTime() < 86400000;
    const fc = fresh
      ? inf?.result.analytics_forecast_7step?.[m.forecast]
      : undefined;
    const all = [
      ...historical.map((h) => h.value),
      ...(fc?.values ?? []),
    ].filter((v): v is number => v != null);
    return {
      crew_id: crew.slug,
      metric,
      window,
      unit: m.unit,
      current: latest
        ? {
            hr: latest.heart_rate,
            spo2: latest.spo2,
            eda: latest.eda,
            hrv: latest.hrv_rmssd_ms,
            sleep: latest.sleep_duration_hr,
          }
        : null,
      historical,
      forecast_7step: fc?.values ?? [],
      forecast_driver: fc?.driver ?? null,
      forecast_method: "experimental_extrapolation",
      forecast_step_hours: 12,
      forecast_timestamps: (fc?.values ?? []).map((_, i) =>
        new Date(
          new Date(inf!.recorded_at).getTime() + (i + 1) * 12 * 3600000,
        ).toISOString(),
      ),
      inference_current: Boolean(fresh),
      forecast_from: inf?.recorded_at ?? null,
      min: all.length ? Math.min(...all) : null,
      mean: all.length
        ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) / 100
        : null,
      max: all.length ? Math.max(...all) : null,
      forecast_end: fc?.forecast_end ?? null,
    };
  });
}

// ------------------------------------------------------------------ digital twin

export async function twin(
  db: Db,
  crewRef: string,
  adherence: number | undefined,
  horizon: number,
) {
  const crew: CrewRef = await resolveCrew(db, crewRef);
  const { baseline, latest } = await db.withCrew(crew.id, async (c) => ({
    baseline: await getBaseline(c, crew),
    latest: (
      await c.query<{
        cardiac_anomaly_prob: number | null;
        heart_rate: number | null;
        recorded_at: Date;
      }>(
        `SELECT i.cardiac_anomaly_prob, v.heart_rate, v.recorded_at
           FROM vitals v LEFT JOIN inferences i ON i.vital_id = v.id
          ORDER BY v.recorded_at DESC LIMIT 1`,
      )
    ).rows[0],
  }));
  const projection = await ml.twin({
    crew_id: crew.slug,
    adherence_pct: adherence ?? baseline.adherence_pct,
    horizon_days: horizon,
    femoral_bmd: baseline.femoral_bmd,
    lumbar_bmd: baseline.lumbar_bmd,
    cardiac_anomaly_prob: latest?.cardiac_anomaly_prob ?? null,
  });
  if (!projection) throw new HttpError(503, "Twin projection unavailable");
  return {
    crew_id: crew.slug,
    heart_rate: latest?.heart_rate ?? null,
    recorded_at: latest?.recorded_at ?? null,
    stored_adherence_pct: baseline.adherence_pct,
    ...projection,
  };
}
