import reference from "./reference-data.json";

// Installed before the real application mounts. No backend request leaves this
// adapter. This is a browser-local demonstration, not a JavaScript ML port.
const KEY = "avia-standalone-db-v1";
const USER = "avia-standalone-user-v1";
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const day = () => now().slice(0, 10);
const id = () => crypto.randomUUID();
const round = (n, places = 2) => Number(Number(n).toFixed(places));
const params = new URLSearchParams(location.search);
const app = params.get("app") === "pulse" ? "pulse" : "cockpit";
const archive = new URL(location.href);
archive.search = "";
archive.hash = "";
let memory;
let storageAvailable = true;
try {
  localStorage.setItem("avia-storage-probe", "1");
  localStorage.removeItem("avia-storage-probe");
} catch {
  storageAvailable = false;
}
function read() {
  if (storageAvailable) {
    try {
      return JSON.parse(localStorage.getItem(KEY)) ?? memory;
    } catch {
      return memory;
    }
  }
  return memory;
}
function persist(db) {
  memory = db;
  if (storageAvailable) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      storageAvailable = false;
    }
  }
}
function initial() {
  const db = {
    version: 1,
    created_at: now(),
    mission: { ...reference.mission, version: 1 },
    crew: {},
    tasks: [],
    alerts: [],
    taskHistory: [],
    activity: [],
    runs: {},
    consents: {},
    journals: {},
    events: {},
  };
  for (const [slug, fixture] of Object.entries(reference.crew)) {
    const history = Array.from({ length: 217 }, (_, i) => {
      const elapsed = 216 - i;
      const t = { ...fixture.telemetry };
      for (const [field, amplitude] of Object.entries({
        hr_bpm: 3,
        spo2_pct: 0.4,
        eda_tonic_us: 0.15,
        hrv_rmssd_ms: 3,
        sleep_duration_hr: 0.4,
      }))
        t[field] = round(
          t[field] + Math.sin(i * 0.47 + fixture.sort_order) * amplitude,
        );
      if (i === 216) Object.assign(t, fixture.telemetry);
      return {
        ...t,
        recorded_at: new Date(Date.now() - elapsed * 3600000).toISOString(),
        source: "local_demo",
      };
    });
    const observations = Array.from({ length: 7 }, (_, i) => ({
      id: id(),
      kind: "mood",
      value: [4, 3, 4, 3, 5, 4, 3][(i + fixture.sort_order) % 7],
      secondary: null,
      unit: "1-5",
      recorded_at: new Date(Date.now() - i * 86400000).toISOString(),
      actor: slug,
    }));
    db.crew[slug] = {
      ...clone(fixture),
      baseline: { ...fixture.baseline, version: 1 },
      history,
      observations,
      updated_at: now(),
      inference_source: "precomputed_reference",
    };
    db.journals[slug] = [
      {
        id: id(),
        text: "Fictional demonstration entry: completed the daily check-in and reviewed sleep history. This entry contains no real crew information.",
        consent: true,
        created_at: now(),
        updated_at: now(),
      },
    ];
    for (const alert of fixture.inference.active_alerts)
      db.alerts.push(makeAlert(slug, alert));
  }
  for (const task of reference.tasks)
    db.tasks.push({
      id: db.tasks.length + 1,
      crew_id: task.crew ?? null,
      label: task.label,
      done: false,
      scheduled_for: day(),
      source: "local_demo",
      created_at: now(),
    });
  for (const slug of Object.keys(db.crew))
    db.tasks.push({
      id: db.tasks.length + 1,
      crew_id: slug,
      label: "Review daily health observations",
      done: false,
      scheduled_for: day(),
      source: "local_demo",
      created_at: now(),
    });
  for (const log of reference.logs)
    db.alerts.push(
      makeAlert(log.crew, {
        ...log,
        status: log.severity,
        model_derived: false,
      }),
    );
  db.activity.push({
    id: id(),
    actor: "local_demo",
    action: "demo_initialized",
    resource: "browser_database",
    detail: { fictional_data: true },
    recorded_at: now(),
  });
  return db;
}
function makeAlert(slug, a) {
  const timestamp = now();
  return {
    id: id(),
    crewId: slug,
    crew_id: slug,
    crewName: reference.crew[slug].name,
    crew_name: reference.crew[slug].name,
    kind: a.kind,
    source: a.source,
    title: a.title,
    detail: a.detail,
    value: a.value ?? "",
    status: a.status ?? "warning",
    severity: a.status ?? "warning",
    state: "open",
    time: timestamp.slice(11, 16),
    timestamp,
    first_seen_at: timestamp,
    last_seen_at: timestamp,
    modelDerived: a.model_derived !== false,
    model_derived: a.model_derived !== false,
    isMock: a.kind === "dermal_scan",
    contributions: a.contributions ?? [],
    explanation: a.explanation ?? a.detail,
  };
}
if (params.get("reset") === "1" || !read()?.version) persist(initial());
let user;
try {
  user = JSON.parse(sessionStorage.getItem(USER));
} catch {}
if (!user || params.has("user")) {
  const slug = params.get("user");
  user = reference.crew[slug]
    ? { name: slug, role: "crew", crew: slug }
    : { name: "operator", role: "operator" };
}
function storeUser() {
  if (user) {
    sessionStorage.setItem(USER, JSON.stringify(user));
    sessionStorage.setItem("avia-session-display", JSON.stringify(user));
  } else sessionStorage.removeItem(USER);
}
storeUser();

function snapshot(db, slug) {
  const c = db.crew[slug],
    t = c.telemetry;
  const alerts = db.alerts.filter(
    (a) => a.crewId === slug && a.state !== "resolved",
  );
  return {
    ...clone(c.inference),
    crew_id: slug,
    crew: {
      id: slug,
      uuid: c.id,
      name: c.name,
      role: c.role,
      initials: c.initials,
      baseline_code: c.baseline_code,
    },
    recorded_at: c.updated_at,
    inference_recorded_at: c.updated_at,
    inference_current: true,
    inference_status: "scored",
    measurement_age_seconds: Math.max(
      0,
      Math.floor((Date.now() - Date.parse(c.updated_at)) / 1000),
    ),
    baseline_version: c.baseline.version,
    provenance: {
      input: "local_demo",
      assessment: c.inference_source,
      forecasts: "illustrative_local_demo",
      bone: "heuristic_bridge",
      context: "NASA_reference_subject",
    },
    vitals_current: {
      hr_bpm: t.hr_bpm,
      spo2_pct: t.spo2_pct,
      eda_us: t.eda_tonic_us,
      hrv_rmssd_ms: t.hrv_rmssd_ms,
      sleep_duration_hr: t.sleep_duration_hr,
      resp_rate_bpm: t.resp_rate_bpm,
      skin_temp_c: t.skin_temp_c,
      source: "local_demo",
    },
    hr_24h_bars: c.history.slice(-24).map((h) => h.hr_bpm),
    active_alerts: clone(alerts),
    symptoms: clone(alerts.filter((a) => !a.modelDerived)),
    model_alerts: alerts.filter((a) => a.modelDerived).map((a) => a.title),
    open_alerts_count: alerts.length,
    strain_markers: {
      Sleep: round(Math.max(0, c.baseline.sleep_hr - t.sleep_duration_hr), 1),
      Workload: round(c.inference.fusion_outputs.stress_score * 100, 0),
    },
  };
}
function crewCard(db, slug) {
  const c = db.crew[slug],
    s = snapshot(db, slug),
    v = s.vitals_current;
  return {
    id: slug,
    uuid: c.id,
    initials: c.initials,
    name: c.name,
    role: c.role,
    status: s.crew_status_badge.toLowerCase(),
    hr: v.hr_bpm,
    spo2: v.spo2_pct,
    eda: v.eda_us,
    hrv: v.hrv_rmssd_ms,
    sleep: v.sleep_duration_hr,
    hrHistory: s.hr_24h_bars,
    flags: s.model_alerts,
    openAlerts: s.open_alerts_count,
    anomalyScore: s.fusion_outputs.anomaly_score,
    whyExplanation: s.why_explanation,
    strainMarkers: s.strain_markers,
    inferenceCurrent: true,
    updatedAt: s.recorded_at,
    measurementAgeSeconds: s.measurement_age_seconds,
    imputedFields: s.imputed_fields ?? [],
    provenance: s.provenance,
  };
}
function tasks(db, slug) {
  return db.tasks.filter((t) => t.crew_id === slug);
}
function context(db, slug) {
  const c = db.crew[slug],
    assigned = tasks(db, slug),
    completed = assigned.filter((t) => t.done).length;
  return {
    snapshot: snapshot(db, slug),
    baseline: c.baseline,
    mission: db.mission,
    tasks: assigned,
    observations: [...c.observations].sort((a, b) =>
      b.recorded_at.localeCompare(a.recorded_at),
    ),
    history: c.history.slice(-168).reverse(),
    progress: {
      completed,
      total: assigned.length,
      due: assigned.filter((t) => !t.done && t.scheduled_for <= day()).length,
      points: completed * 10,
      rule: "Demo engagement points; not a health score",
    },
  };
}
function twin(
  db,
  slug,
  adherence = db.crew[slug].baseline.adherence_pct,
  horizon = 60,
) {
  const c = db.crew[slug],
    result = clone(c.projection),
    p = result.skeletal_risk_projection;
  const multiplier = Math.max(
    0.1,
    (1.6 - Number(adherence) * 0.0088) /
      Math.max(
        0.1,
        1.6 - c.projection.skeletal_risk_projection.adherence_pct * 0.0088,
      ),
  );
  for (const [name, r] of Object.entries(p.regions)) {
    r.today_bmd = c.baseline[name === "femoral" ? "femoral_bmd" : "lumbar_bmd"];
    r.rate_per_day = round(r.rate_per_day * multiplier, 6);
    r.projected_bmd = round(r.today_bmd - r.rate_per_day * horizon, 3);
    r.warning_in_days = Math.max(
      0,
      Math.ceil((r.today_bmd - r.thresholds.warning) / r.rate_per_day),
    );
    r.status_projected =
      r.projected_bmd < r.thresholds.critical
        ? "Critical"
        : r.projected_bmd < r.thresholds.warning
          ? "Warning"
          : "Nominal";
  }
  p.adherence_pct = Number(adherence);
  p.horizon_days = Number(horizon);
  p.warning_in_days = Math.min(
    ...Object.values(p.regions).map((r) => r.warning_in_days),
  );
  result.heart_rate = c.telemetry.hr_bpm;
  return result;
}
function suit(input) {
  const fields = ["left_arm", "right_arm", "legs", "torso"];
  const worst = fields.reduce((a, b) =>
    Number(input["suit_p_" + a + "_psi"] ?? 4.3) <
    Number(input["suit_p_" + b + "_psi"] ?? 4.3)
      ? a
      : b,
  );
  const pressure = Number(input["suit_p_" + worst + "_psi"] ?? 4.3);
  const result = clone(reference.suit[pressure < 3.5 ? worst : "nominal"]);
  result.crew_id = input.crew_id ?? "okafor";
  result.model_version = "precomputed-reference-demo";
  // Preset classification is a lookup, not execution of the PyTorch model.
  const body = result.digital_twin_body_map;
  for (const [part, region] of Object.entries({
    left_arm: "left_forearm",
    right_arm: "right_forearm",
    legs: "lower_body_femoral",
    torso: "torso_cardiopulmonary",
  })) {
    const p = Number(input["suit_p_" + part + "_psi"] ?? 4.3);
    body[region] = p < 2.5 ? "Critical" : p < 3.5 ? "Warning" : "Nominal";
  }
  return result;
}
function analytics(db, slug, metric, range) {
  const field =
    {
      hr: "hr_bpm",
      spo2: "spo2_pct",
      eda: "eda_tonic_us",
      hrv: "hrv_rmssd_ms",
      sleep: "sleep_duration_hr",
    }[metric] ?? "hr_bpm";
  const c = db.crew[slug],
    count = range === "30d" ? 217 : range === "7d" ? 168 : 24;
  const historical = c.history
    .slice(-count)
    .map((h) => ({ t: h.recorded_at, value: h[field] }));
  const v = c.telemetry[field];
  const values =
    c.inference_source === "precomputed_reference"
      ? (c.inference.analytics_forecast_7step[field]?.values ??
        Array(7).fill(v))
      : Array.from({ length: 7 }, (_, i) =>
          round(
            v +
              (c.baseline[
                {
                  hr_bpm: "hr_bpm",
                  spo2_pct: "spo2_pct",
                  eda_tonic_us: "eda_us",
                  hrv_rmssd_ms: "rmssd_ms",
                  sleep_duration_hr: "sleep_hr",
                }[field]
              ] -
                v) *
                0.015 *
                (i + 1),
          ),
        );
  return {
    current: crewCard(db, slug),
    historical,
    forecast_timestamps: values.map((_, i) =>
      new Date(Date.parse(c.updated_at) + (i + 1) * 12 * 3600000).toISOString(),
    ),
    inference_current: true,
    forecast_7step: values,
    min: Math.min(...values),
    max: Math.max(...values),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length),
    forecast_end: values.at(-1),
  };
}
function record(db, action, resource, detail = {}) {
  db.activity.unshift({
    id: id(),
    actor: user.name,
    action,
    resource,
    detail,
    recorded_at: now(),
  });
}
function ingest(db, slug, body) {
  if (body.event_id && db.events[body.event_id]) return snapshot(db, slug);
  const c = db.crew[slug];
  const bounds = {
    hr_bpm: [40, 180],
    spo2_pct: [70, 100],
    eda_tonic_us: [0.05, 40],
    hrv_rmssd_ms: [5, 150],
    sleep_duration_hr: [0, 12],
  };
  for (const [key, [lo, hi]] of Object.entries(bounds))
    if (
      body[key] != null &&
      (!Number.isFinite(Number(body[key])) ||
        Number(body[key]) < lo ||
        Number(body[key]) > hi)
    )
      throw Object.assign(Error(`Invalid ${key}: expected ${lo}–${hi}`), {
        status: 422,
      });
  const observed = body.recorded_at ?? now();
  if (!Number.isFinite(Date.parse(observed)))
    throw Object.assign(Error("Invalid observation timestamp"), {
      status: 422,
    });
  const t = {
    ...c.telemetry,
    ...Object.fromEntries(
      Object.entries(body).filter(([key]) => key in c.telemetry),
    ),
  };
  c.history.push({ ...t, recorded_at: observed, source: "local_demo" });
  c.history.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  if (Date.parse(observed) >= Date.parse(c.updated_at)) {
    c.telemetry = t;
    c.updated_at = observed;
    c.inference_source = "browser_simulation";
    const critical = t.spo2_pct < 90 || t.hr_bpm > 130,
      sleep = t.sleep_duration_hr < 6,
      stress = t.eda_tonic_us > 4;
    c.inference.crew_status_badge = critical
      ? "Critical"
      : sleep || stress || t.spo2_pct < 95
        ? "Warning"
        : "Nominal";
    c.inference.fusion_outputs = {
      anomaly_score: critical ? 0.82 : sleep || stress ? 0.47 : 0.12,
      recovery_score: sleep ? 0.36 : 0.78,
      stress_score: stress ? 0.84 : 0.18,
    };
    c.inference.personal_z_scores = {
      HR_z: round((t.hr_bpm - c.baseline.hr_bpm) / c.baseline.hr_sd),
      EDA_z: round((t.eda_tonic_us - c.baseline.eda_us) / c.baseline.eda_sd),
      HRV_z: round(
        (t.hrv_rmssd_ms - c.baseline.rmssd_ms) / c.baseline.rmssd_sd,
      ),
      Sleep_z: round(
        (t.sleep_duration_hr - c.baseline.sleep_hr) / c.baseline.sleep_sd,
      ),
    };
    c.inference.why_explanation =
      "Browser-only demonstration assessment using simple illustrative thresholds. No trained model was run for this input.";
    c.inference.model_version = "browser-simulation-v1";
    db.alerts
      .filter((a) => a.crewId === slug && a.modelDerived)
      .forEach((a) => (a.state = "resolved"));
    const active = [];
    if (critical)
      active.push({
        kind: "hypoxia",
        source: "LOCAL DEMO",
        title: "Critical demonstration reading — review required",
        detail: "Illustrative local guardrail; no live inference.",
        status: "critical",
      });
    if (sleep)
      active.push({
        kind: "sleep",
        source: "LOCAL DEMO",
        title: `Sleep ${t.sleep_duration_hr} h, below warning`,
        detail: "Demonstration sleep threshold; review stored observation.",
        status: "warning",
      });
    if (stress)
      active.push({
        kind: "stress",
        source: "LOCAL DEMO",
        title: `EDA spike ${t.eda_tonic_us} µS`,
        detail: "Illustrative local scenario.",
        status: "warning",
      });
    active.forEach((a) => db.alerts.unshift(makeAlert(slug, a)));
  }
  if (body.event_id) db.events[body.event_id] = true;
  record(db, "observation_saved", slug, { source: "browser_simulation" });
  return snapshot(db, slug);
}
const sources = [
  { id: "reading", title: "Stored fictional demo observations", url: null },
  { id: "tasks", title: "Browser-local care tasks", url: null },
  {
    id: "nasa",
    title: "NASA: Spaceflight hazards",
    url: "https://www.nasa.gov/hrp/hazards/",
  },
  {
    id: "vitals",
    title: "MedlinePlus: Vital signs",
    url: "https://medlineplus.gov/vitalsigns.html",
  },
];
function assistantRun(db, slug, body) {
  if (db.runs[body.request_id]) return db.runs[body.request_id];
  const mode =
      body.mode === "auto" ? "assessment" : (body.mode ?? "assessment"),
    proposals = [];
  if (body.observation) {
    const o = body.observation;
    if (
      !o.unit ||
      !Number.isFinite(Date.parse(o.recorded_at)) ||
      (o.kind === "mood" &&
        (!Number.isInteger(Number(o.value)) || o.value < 1 || o.value > 5))
    )
      throw Object.assign(
        Error("Review the value, unit and observation time."),
        { status: 422 },
      );
    proposals.push({ id: id(), type: "observation", observation: clone(o) });
  }
  if (body.telemetry)
    proposals.push({
      id: id(),
      type: "telemetry",
      telemetry: clone(body.telemetry),
    });
  if (["action", "routine", "wellbeing", "briefing"].includes(mode))
    proposals.push({
      id: id(),
      type: "task",
      label:
        mode === "wellbeing"
          ? "Review sleep and wellbeing check-in"
          : "Review latest crew health observations",
      scheduled_for: day(),
    });
  const text = {
    assessment:
      "Review the stored observation alongside the personal baseline and timestamps. This standalone package displays precomputed reference outputs or illustrative browser rules; it does not execute the trained models.",
    knowledge:
      "Spaceflight hazards include altered gravity, isolation, radiation, distance from Earth and closed environments. These bundled educational references are available as links; source websites require internet access.",
    intake:
      "Review the proposed value, unit and timestamp before confirming. Confirmation saves the entry only in this browser database.",
    action:
      "Review the available evidence and confirm a follow-up task if appropriate. No action is saved until you explicitly confirm it.",
    routine:
      "Review your due tasks and the latest observations. Completion progress reflects stored tasks, not a health score.",
    wellbeing:
      "Consider your recorded sleep and mood together. You can keep a local journal and choose whether its demo entry is visible to the operator. This demonstration does not diagnose mental health conditions.",
    twin: "Compare the baseline and adjusted software scenarios. These are precomputed reference examples and illustrative local calculations, not live model predictions.",
    briefing:
      "This briefing combines the selected crew record, recent observations and stored care tasks. Check the timestamps and follow-up status before using a handover.",
  }[mode];
  const result = {
    id: body.request_id ?? id(),
    question: body.message,
    created_at: now(),
    crew: slug,
    actor: user.name,
    mode,
    provider: "local",
    model: null,
    fallback_reason: "local_requested",
    agents: ["coordinator", mode, "supervisor"],
    urgent: snapshot(db, slug).crew_status_badge === "Critical",
    notice:
      "Standalone demonstration: fictional data, local templates and simulated assessments. No backend, cloud AI or live PyTorch inference.",
    context: context(db, slug),
    sections: [
      {
        text: text ?? "Review the stored fictional evidence.",
        source_ids: ["reading", "nasa"],
      },
    ],
    questions:
      mode === "intake" && !proposals.length
        ? ["Use the observation form to specify a value, unit and time."]
        : [],
    proposals,
    sources: clone(sources),
    scenario:
      mode === "twin"
        ? {
            parameters: body.scenario ?? {
              adherence_pct: 70,
              horizon_days: 60,
              suit_preset: "nominal",
            },
            baseline: twin(db, slug),
            changed: twin(
              db,
              slug,
              body.scenario?.adherence_pct ?? 70,
              body.scenario?.horizon_days ?? 60,
            ),
            suit: suit({
              crew_id: slug,
              ...(body.scenario?.suit_preset === "left_arm"
                ? { suit_p_left_arm_psi: 1.8 }
                : {}),
            }),
          }
        : null,
  };
  db.runs[result.id] = result;
  return result;
}

async function route(path, method, body, search, db) {
  if (path === "/auth/session")
    return user ? user : { __status: 401, error: "Signed out", demo: true };
  if (path === "/auth/login") {
    if (body.username === "operator" && body.password === "avia-demo-operator")
      user = { name: "operator", role: "operator" };
    else if (
      reference.crew[body.username] &&
      body.password === "avia-demo-crew"
    )
      user = { name: body.username, role: "crew", crew: body.username };
    else
      return { __status: 401, error: "Use the documented demo credentials." };
    storeUser();
    return user;
  }
  if (path === "/auth/logout") {
    user = null;
    storeUser();
    return {};
  }
  if (!user) return { __status: 401, error: "Sign in to the local demo." };
  if (["/health", "/api/v1/health"].includes(path))
    return {
      status: "online",
      models_loaded: true,
      api: "local_demo",
      db: "browser",
      ml: "precomputed_reference",
      redis: "not_required",
    };
  let match = path.match(/\/(?:crew|pulse\/crew)\/([^/]+)/);
  let slug = body?.crew_id ?? match?.[1];
  if (slug && !db.crew[slug]) return { __status: 404, error: "Unknown crew" };
  if (user.role === "crew" && slug && slug !== user.crew)
    return {
      __status: 403,
      error: "This demo account is scoped to its own crew.",
    };
  if (path === "/cockpit/crew")
    return Object.keys(db.crew)
      .filter((s) => user.role === "operator" || s === user.crew)
      .map((s) => crewCard(db, s));
  if (path === "/cockpit/alerts")
    return db.alerts.filter(
      (a) =>
        (search.get("state") === "all" || a.state !== "resolved") &&
        (user.role === "operator" || a.crewId === user.crew),
    );
  if (path === "/cockpit/mission") {
    if (method === "PUT") {
      Object.assign(db.mission, body);
      db.mission.version++;
      record(db, "mission_updated", "mission");
    }
    return db.mission;
  }
  if (path === "/software/activity")
    return user.role === "operator"
      ? db.activity
      : { __status: 403, error: "Operator permission required" };
  if (path === "/api/v1/pulse/ingest" || path.endsWith("/telemetry"))
    return ingest(db, slug, body);
  if (path === "/api/v1/suit/evaluate") return suit(body);
  if (path.includes("/countermeasures")) {
    const taskId = path.split("/")[3];
    if (method === "GET")
      return db.tasks.filter(
        (t) => user.role === "operator" || t.crew_id === user.crew,
      );
    if (method === "POST") {
      const task = {
        id: Math.max(0, ...db.tasks.map((t) => Number(t.id))) + 1,
        crew_id: body.crew_id ?? null,
        label: String(body.label ?? "").trim(),
        scheduled_for: body.scheduled_for ?? day(),
        done: false,
        created_at: now(),
      };
      if (!task.label)
        return { __status: 422, error: "Task label is required" };
      db.tasks.push(task);
      record(db, "task_created", task.id);
      return task;
    }
    return updateTask(db, taskId, body);
  }
  if (!slug)
    return {
      __status: 404,
      error: `Unsupported local route: ${method} ${path}`,
    };
  const c = db.crew[slug];
  if (path.endsWith("/configuration")) {
    Object.assign(c.baseline, body.baseline);
    Object.assign(db.mission, body.mission);
    c.baseline.version++;
    record(db, "configuration_saved", slug);
    return { baseline: c.baseline, mission: db.mission };
  }
  if (path.endsWith("/baseline")) {
    if (method === "PUT") {
      Object.assign(c.baseline, body);
      c.baseline.version++;
      record(db, "baseline_saved", slug);
    }
    return c.baseline;
  }
  if (path.endsWith("/analytics"))
    return analytics(
      db,
      slug,
      search.get("metric") ?? "hr",
      search.get("window") ?? "24h",
    );
  if (path.endsWith("/twin"))
    return twin(
      db,
      slug,
      Number(search.get("adherence") ?? c.baseline.adherence_pct),
    );
  if (path.endsWith("/state")) return snapshot(db, slug);
  if (path.endsWith("/overview"))
    return {
      crew: crewCard(db, slug),
      state: snapshot(db, slug),
      vitals: c.history,
    };
  if (path.endsWith("/symptoms")) {
    if (!db.events[body.event_id]) {
      db.alerts.unshift(
        makeAlert(slug, {
          kind: "symptom",
          source: "LOCAL LOG",
          title: "Symptom logged: " + body.label,
          detail: body.label,
          status: "warning",
          model_derived: false,
        }),
      );
      db.events[body.event_id] = true;
      record(db, "symptom_saved", slug);
    }
    return {};
  }
  if (path.includes("/alerts/")) {
    const a = db.alerts.find(
      (a) => a.id === path.split("/").at(-1) && a.crewId === slug,
    );
    if (!a) return { __status: 404, error: "Alert not found" };
    a.state = body.state;
    record(db, "alert_" + body.state, a.id);
    return a;
  }
  if (path.endsWith("/task-history"))
    return db.taskHistory.filter((t) => t.crew_id === slug);
  if (path.endsWith("/tasks")) return tasks(db, slug);
  if (path.includes("/tasks/"))
    return updateTask(db, path.split("/").at(-1), body);
  if (path.includes("/journal")) {
    const all = db.journals[slug],
      journalId = path.split("/journal/")[1];
    if (method === "GET")
      return all.filter((j) => user.role === "crew" || j.consent);
    if (user.role !== "crew")
      return {
        __status: 403,
        error: "Only the owner can change journal entries",
      };
    if (method === "POST") {
      if (!String(body.text ?? "").trim())
        return { __status: 422, error: "Journal text is required" };
      const j = {
        id: id(),
        text: String(body.text),
        consent: !!body.consent,
        created_at: now(),
        updated_at: now(),
      };
      all.unshift(j);
      record(db, "journal_created", slug);
      return j;
    }
    const j = all.find((j) => j.id === journalId);
    if (!j) return { __status: 404, error: "Entry not found" };
    if (method === "PATCH")
      Object.assign(j, { consent: !!body.consent, updated_at: now() });
    if (method === "DELETE")
      db.journals[slug] = all.filter((j) => j.id !== journalId);
    record(db, "journal_" + method.toLowerCase(), slug);
    return {};
  }
  if (path.includes("/assistant")) {
    const suffix = path.split("/assistant")[1];
    const consentKey = slug + ":" + user.name;
    if (suffix === "")
      return {
        consent: { cloud: false, journal: false },
        context: context(db, slug),
        runs: Object.values(db.runs)
          .filter((r) => r.crew === slug && r.actor === user.name)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((r) => ({
            id: r.id,
            mode: r.mode,
            created_at: r.created_at,
            question: r.question,
          })),
        agents: [
          "coordinator",
          "intake",
          "assessment",
          "knowledge",
          "action",
          "routine",
          "wellbeing",
          "twin",
          "briefing",
          "supervisor",
        ].map((id) => ({ id, description: "Local demonstration role" })),
      };
    if (suffix === "/consent") {
      db.consents[consentKey] = { cloud: false, journal: false };
      return { cloud: false, journal: false };
    }
    if (suffix === "/run") return assistantRun(db, slug, body);
    if (suffix.startsWith("/observations/")) {
      c.observations = c.observations.filter(
        (o) => o.id !== suffix.split("/").at(-1),
      );
      return {};
    }
    const run = db.runs[suffix.split("/")[2]];
    if (!run || run.crew !== slug || run.actor !== user.name)
      return { __status: 404, error: "Review not found" };
    if (suffix.endsWith("/confirm")) {
      if (body.confirm !== true)
        return { __status: 422, error: "Explicit confirmation required" };
      const p = run.proposals.find((p) => p.id === body.action_id);
      if (!p) return { __status: 404, error: "Action not found" };
      if (p.result) return p.result;
      if (p.type === "observation") {
        const observation = { ...p.observation, id: id(), actor: user.name };
        c.observations.unshift(observation);
        p.result = { id: observation.id, actor: user.name };
      }
      if (p.type === "telemetry") {
        ingest(db, slug, { ...p.telemetry, event_id: p.id });
        p.result = { actor: user.name, accepted_status: 201 };
      }
      if (p.type === "task") {
        const task = {
          id: Math.max(0, ...db.tasks.map((t) => Number(t.id))) + 1,
          crew_id: slug,
          label: p.label,
          scheduled_for: p.scheduled_for,
          done: false,
          created_at: now(),
        };
        db.tasks.push(task);
        p.result = { actor: user.name, id: task.id };
      }
      record(db, "action_confirmed", slug, { type: p.type });
      return p.result;
    }
    if (method === "DELETE") {
      delete db.runs[run.id];
      return {};
    }
    return run;
  }
  return { __status: 404, error: `Unsupported local route: ${method} ${path}` };
}
function updateTask(db, taskId, body) {
  const t = db.tasks.find((t) => String(t.id) === String(taskId));
  if (!t) return { __status: 404, error: "Task not found" };
  if (user.role === "crew" && t.crew_id !== user.crew)
    return { __status: 403, error: "Crew task access denied" };
  t.done = !!body.done;
  t.completed_at = t.done ? now() : null;
  t.completed_by = t.done ? user.name : null;
  db.taskHistory.unshift({
    id: id(),
    task_id: t.id,
    crew_id: t.crew_id,
    actor: user.name,
    label: t.label,
    done: t.done,
    scheduled_for: t.scheduled_for,
    recorded_at: now(),
  });
  record(db, "task_updated", t.id);
  return t;
}

window.fetch = async (input, options = {}) => {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(raw, "https://avia.local");
  if (!url.pathname.startsWith("/bff/") && !url.pathname.startsWith("/api/"))
    return new Response(
      JSON.stringify({
        error: "Standalone demo: network requests are disabled.",
      }),
      { status: 503 },
    );
  const path = url.pathname.replace(/^\/bff/, "");
  const method = (options.method ?? input.method ?? "GET").toUpperCase();
  const rawBody =
    options.body ?? (input instanceof Request ? await input.text() : undefined);
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 422,
    });
  }
  try {
    const db = read();
    const result = clone(await route(path, method, body, url.searchParams, db));
    const status = result?.__status ?? 200;
    if (result && "__status" in result) delete result.__status;
    if (method !== "GET" && status < 400) {
      persist(db);
      queueMicrotask(() =>
        window.dispatchEvent(new Event("avia-data-changed")),
      );
    }
    return new Response(JSON.stringify(result ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status ?? 500,
      headers: { "content-type": "application/json" },
    });
  }
};
window.addEventListener("storage", (e) => {
  if (e.key === KEY) window.dispatchEvent(new Event("avia-data-changed"));
});
function downloadDatabase() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(read(), null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "avia-local-database.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.aviaStandalone = {
  version: 1,
  app,
  exportData: downloadDatabase,
  read: () => clone(read()),
  reset: () => {
    persist(initial());
    location.reload();
  },
  storageAvailable: () => storageAvailable,
};
new MutationObserver(() => {
  const bar = document.querySelector(".platform-session");
  if (!bar || bar.querySelector("[data-local-controls]")) return;
  const holder = document.createElement("span");
  holder.dataset.localControls = "true";
  holder.style.cssText =
    "display:inline-flex;gap:8px;align-items:center;margin-left:auto";
  const link = document.createElement("a");
  link.href =
    archive.href + "?app=" + (app === "cockpit" ? "pulse" : "cockpit");
  link.textContent = app === "cockpit" ? "Open Pulse ↗" : "Open Cockpit ↗";
  link.style.cssText = "color:inherit;text-decoration:none";
  const exportButton = document.createElement("button");
  exportButton.textContent = "Export local data";
  exportButton.onclick = downloadDatabase;
  holder.append(link, exportButton);
  bar.append(holder);
  if (!storageAvailable) {
    const message = document.createElement("span");
    message.textContent =
      "Storage unavailable — changes last only until this page closes";
    bar.append(message);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
