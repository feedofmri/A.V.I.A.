import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.BFF_URL ?? "http://localhost:24000";
async function login(name = "operator") {
  const r = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: name,
      password: name === "operator" ? "avia-demo-operator" : "avia-demo-crew",
    }),
  });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
async function call(path, method = "GET", body, cookie) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
let operator, crew, run, proposal;
const root = "/software/crew/brandt/assistant";
const input = (mode = "assessment", more = {}) => ({
  request_id: randomUUID(),
  message: "Explain my health evidence and supported follow-up.",
  mode,
  use_cloud: false,
  ...more,
});
test("assistant requires authentication", async () =>
  assert.equal((await call(root)).status, 401));
test("assistant exposes ten roles and no provider credentials", async () => {
  operator = await login();
  crew = await login("brandt");
  // A retained disposable database may contain preferences from a prior browser run.
  for (const cookie of [operator, crew]) {
    const reset = await call(root + "/consent", "PUT", { cloud: false, journal: false }, cookie);
    assert.equal(reset.status, 200);
  }
  const r = await call(root, "GET", undefined, operator);
  assert.equal(r.status, 200);
  assert.equal(r.body.agents.length, 10);
  assert.equal(r.body.consent.cloud, false);
  assert.ok(!JSON.stringify(r.body).includes("MODEL_API_KEY"));
});
test("crew cannot access other crew assistants", async () =>
  assert.equal(
    (await call("/software/crew/sato/assistant", "GET", undefined, crew))
      .status,
    403,
  ));
test("local assessment includes authoritative evidence and sources", async () => {
  const body = input("action");
  const r = await call(root + "/run", "POST", body, operator);
  assert.equal(r.status, 200);
  run = r.body;
  assert.equal(run.provider, "local");
  assert.equal(run.fallback_reason, "local_requested");
  assert.ok(run.sources.length);
  assert.ok(run.proposals.length);
  proposal = run.proposals[0];
  const again = await call(root + "/run", "POST", body, operator);
  assert.equal(again.body.id, run.id);
  assert.deepEqual(again.body.proposals, run.proposals);
});
test("request identity conflicts are rejected", async () =>
  assert.equal(
    (
      await call(
        root + "/run",
        "POST",
        input("action", { request_id: run.id, message: "changed" }),
        operator,
      )
    ).status,
    409,
  ));
test("run history belongs to its creating account", async () =>
  assert.equal(
    (await call(root + "/runs/" + run.id, "GET", undefined, crew)).status,
    404,
  ));
test("actions require affirmative confirmation", async () =>
  assert.equal(
    (
      await call(
        `${root}/runs/${run.id}/confirm`,
        "POST",
        { action_id: proposal.id, confirm: false },
        operator,
      )
    ).status,
    422,
  ));
test("confirmation creates one task and safely replays", async () => {
  const p = `${root}/runs/${run.id}/confirm`,
    body = { action_id: proposal.id, confirm: true };
  const first = await call(p, "POST", body, operator),
    again = await call(p, "POST", body, operator);
  assert.equal(first.status, 200);
  assert.equal(first.body.confirmed, true);
  assert.equal(first.body.id, again.body.id);
  assert.equal(again.body.duplicate, true);
});
test("explicit natural-language vitals create a reviewable local proposal", async () => {
  const at = new Date().toISOString();
  const r = await call(
    root + "/run",
    "POST",
    input("intake", {
      message: `Record heart rate 80 bpm and SpO2 98% observed at ${at}`,
    }),
    operator,
  );
  assert.equal(r.status, 200);
  const p = r.body.proposals.find((p) => p.type === "telemetry");
  assert.ok(p);
  assert.equal(p.confirmed, false);
  assert.equal(p.telemetry.hr_bpm, 80);
  assert.equal(p.telemetry.recorded_at, at);
});
test("arbitrary action ids cannot execute", async () =>
  assert.equal(
    (
      await call(
        `${root}/runs/${run.id}/confirm`,
        "POST",
        { action_id: randomUUID(), confirm: true },
        operator,
      )
    ).status,
    404,
  ));
test("wrong observation units rejected before saving", async () =>
  assert.equal(
    (
      await call(
        root + "/run",
        "POST",
        input("intake", {
          observation: {
            kind: "glucose",
            value: 95,
            secondary: null,
            unit: "mmol/L",
            recorded_at: new Date().toISOString(),
          },
        }),
        operator,
      )
    ).status,
    422,
  ));
test("new observations require confirmation and support deletion", async () => {
  const r = await call(
    root + "/run",
    "POST",
    input("intake", {
      observation: {
        kind: "mood",
        value: 3,
        secondary: null,
        unit: "1-5",
        recorded_at: new Date().toISOString(),
      },
    }),
    crew,
  );
  assert.equal(r.status, 200);
  const p = r.body.proposals[0];
  assert.equal(p.confirmed, false);
  const confirmed = await call(
    `${root}/runs/${r.body.id}/confirm`,
    "POST",
    { action_id: p.id, confirm: true },
    crew,
  );
  assert.equal(confirmed.status, 200);
  const mine = await call(root, "GET", undefined, crew);
  assert.ok(mine.body.context.observations.some((x) => x.id === p.id));
  const others = await call(root, "GET", undefined, operator);
  assert.ok(!others.body.context.observations.some((x) => x.id === p.id));
  assert.equal(
    (await call(root + "/observations/" + p.id, "DELETE", undefined, crew))
      .status,
    204,
  );
});
test("operator cannot grant journal cloud-processing consent", async () =>
  assert.equal(
    (
      await call(
        root + "/consent",
        "PUT",
        { cloud: true, journal: true },
        operator,
      )
    ).status,
    403,
  ));
test("journal processing requires owner-specific consent", async () =>
  assert.equal(
    (
      await call(
        root + "/run",
        "POST",
        input("wellbeing", { journal_id: randomUUID(), use_cloud: true }),
        crew,
      )
    ).status,
    403,
  ));
test("cloud request without consent returns local guidance", async () => {
  const r = await call(
    root + "/run",
    "POST",
    input("knowledge", { use_cloud: true }),
    crew,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.provider, "local");
  assert.equal(r.body.fallback_reason, "cloud_consent_required");
});
test("consent can be saved and revoked", async () => {
  for (const cloud of [true, false]) {
    const r = await call(
      root + "/consent",
      "PUT",
      { cloud, journal: cloud },
      crew,
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.cloud, cloud);
  }
});
test("briefing has actual task progress and timestamps", async () => {
  const r = await call(root + "/run", "POST", input("briefing"), crew);
  assert.equal(r.status, 200);
  assert.ok(r.body.context.progress.total >= 0);
  assert.ok(r.body.created_at);
});
test("severe symptoms trigger local urgent guidance", async () => {
  const r = await call(
    root + "/run",
    "POST",
    input("action", { message: "I have chest pain and cannot breathe" }),
    crew,
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.urgent, true);
  assert.match(r.body.notice, /Do not wait/);
});
test("twin assistant executes real model scenarios", async () => {
  const r = await call(
    root + "/run",
    "POST",
    input("twin", {
      scenario: {
        adherence_pct: 40,
        horizon_days: 30,
        suit_preset: "left_arm",
      },
    }),
    operator,
  );
  assert.equal(r.status, 200);
  assert.ok(r.body.scenario.baseline);
  assert.ok(r.body.scenario.changed);
  assert.ok(r.body.scenario.suit);
  assert.equal(r.body.scenario.suit.predicted_zone_id, 1);
});
test("history supports explicit deletion", async () => {
  assert.equal(
    (await call(root + "/runs/" + run.id, "DELETE", undefined, operator))
      .status,
    204,
  );
  assert.equal(
    (await call(root + "/runs/" + run.id, "GET", undefined, operator)).status,
    404,
  );
});
test("confirmed model-supported intake invokes existing inference and preserves critical status", async () => {
  const r = await call(
    root + "/run",
    "POST",
    input("intake", {
      telemetry: {
        hr_bpm: 100,
        spo2_pct: 86,
        eda_tonic_us: 2,
        hrv_rmssd_ms: 40,
        sleep_duration_hr: 6,
        recorded_at: new Date().toISOString(),
      },
    }),
    operator,
  );
  assert.equal(r.status, 200);
  const p = r.body.proposals.find((p) => p.type === "telemetry");
  assert.ok(p);
  const saved = await call(
    `${root}/runs/${r.body.id}/confirm`,
    "POST",
    { action_id: p.id, confirm: true },
    operator,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.confirmed, true);
  assert.equal(saved.body.accepted_status, 201);
  const current = await call(root, "GET", undefined, operator);
  assert.equal(current.body.context.snapshot.crew_status_badge, "Critical");
  const again = await call(
    `${root}/runs/${r.body.id}/confirm`,
    "POST",
    { action_id: p.id, confirm: true },
    operator,
  );
  assert.equal(again.body.duplicate, true);
});
