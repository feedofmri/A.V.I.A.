import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const BFF = process.env.BFF_URL ?? 'http://localhost:24000';
const CORE = process.env.CORE_URL ?? 'http://localhost:23000';
const ML = process.env.ML_URL ?? 'http://localhost:28000';
const token = process.env.INTERNAL_API_TOKEN;
let operator, brandt, sato;
async function login(username, password) {
  const r = await fetch(BFF + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.headers.get('set-cookie').split(';')[0];
}
async function call(path, method = 'GET', body, cookie = operator) {
  const r = await fetch(BFF + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
async function core(path, method = 'GET', body) {
  const r = await fetch(CORE + path, {
    method,
    headers: {
      'x-internal-token': token,
      'x-role': 'operator',
      'x-actor': 'regression-test',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}
const nominal = {
  hr_bpm: 61,
  spo2_pct: 98,
  eda_tonic_us: 1.9,
  hrv_rmssd_ms: 62,
  sleep_duration_hr: 7.5,
  eeg_delta_rel: 0.9302,
  eeg_theta_rel: 0.0517,
  eeg_sigma_rel: 0.0048,
  eeg_beta_rel: 0.0014,
  eog_std_uv: 18.16,
};
before(async () => {
  operator = await login('operator', 'avia-demo-operator');
  brandt = await login('brandt', 'avia-demo-crew');
  sato = await login('sato', 'avia-demo-crew');
});
test('anonymous and forged internal requests are denied', async () => {
  assert.equal((await call('/cockpit/crew', 'GET', null, null)).status, 401);
  assert.equal((await fetch(CORE + '/crew/brandt/state')).status, 401);
  assert.equal(
    (
      await fetch(CORE + '/crew/brandt/state', {
        headers: { 'x-internal-token': 'wrong' },
      })
    ).status,
    401,
  );
});
test('crew scope and operator privileges are enforced', async () => {
  assert.equal(
    (await call('/cockpit/crew/sato/state', 'GET', null, brandt)).status,
    403,
  );
  assert.equal(
    (await call('/cockpit/crew/brandt/state', 'GET', null, brandt)).status,
    200,
  );
  assert.equal(
    (await call('/cockpit/mission', 'PUT', { mission_day: 142 }, brandt))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        '/api/v1/pulse/ingest',
        'POST',
        { crew_id: 'sato', ...nominal },
        brandt,
      )
    ).status,
    403,
  );
});
test('cross-origin writes are rejected', async () => {
  const r = await fetch(BFF + '/auth/login', {
    method: 'POST',
    headers: {
      origin: 'https://untrusted.example',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: 'operator',
      password: 'avia-demo-operator',
    }),
  });
  assert.equal(r.status, 403);
});
test('critical guardrail propagates to crew badge', async () => {
  const r = await call('/api/v1/pulse/ingest', 'POST', {
    crew_id: 'brandt',
    ...nominal,
    spo2_pct: 80,
    event_id: randomUUID(),
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.crew_status_badge, 'Critical');
  assert.ok(
    r.body.active_alerts.some(
      (a) => a.kind === 'hypoxia' && a.severity === 'critical',
    ),
  );
  await call('/api/v1/pulse/ingest', 'POST', {
    crew_id: 'brandt',
    ...nominal,
    event_id: randomUUID(),
  });
});
test('historical normal readings cannot clear current alerts', async () => {
  await core('/crew/diaz/telemetry', 'POST', {
    ...nominal,
    hr_bpm: 96,
    eda_tonic_us: 5.1,
    hrv_rmssd_ms: 31,
    scr_peaks_min: 35,
    event_id: randomUUID(),
  });
  const before = (await core('/crew/diaz/state')).body;
  const result = await core('/crew/diaz/telemetry', 'POST', {
    ...nominal,
    hr_bpm: 70,
    eda_tonic_us: 2.1,
    hrv_rmssd_ms: 48,
    sleep_duration_hr: 7.2,
    recorded_at: new Date(Date.now() - 3600000).toISOString(),
    event_id: randomUUID(),
  });
  assert.equal(result.status, 201);
  const after = (await core('/crew/diaz/state')).body;
  assert.equal(before.vital_id, after.vital_id);
  assert.deepEqual(
    before.active_alerts.map((a) => a.kind),
    after.active_alerts.map((a) => a.kind),
  );
});
test('duplicate events return the same committed identity and conflicts are rejected', async () => {
  const payload = {
    ...nominal,
    event_id: randomUUID(),
    recorded_at: new Date().toISOString(),
  };
  const a = await core('/crew/brandt/telemetry', 'POST', payload),
    b = await core('/crew/brandt/telemetry', 'POST', payload);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.body.submitted_vital_id, b.body.submitted_vital_id);
  assert.equal(b.body.duplicate, true);
  assert.equal(
    (await core('/crew/brandt/telemetry', 'POST', { ...payload, hr_bpm: 62 }))
      .status,
    409,
  );
});
test('concurrent equal-time events retain deterministic current state', async () => {
  const at = new Date().toISOString();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      core('/crew/brandt/telemetry', 'POST', {
        ...nominal,
        spo2_pct: 80,
        recorded_at: at,
        event_id: randomUUID(),
      }),
    ),
  );
  assert.ok(
    results.every((r) => r.status === 201),
    JSON.stringify(results),
  );
  const current = (await core('/crew/brandt/state')).body;
  assert.equal(current.inference_current, true);
  assert.equal(current.crew_status_badge, 'Critical');
  await core('/crew/brandt/telemetry', 'POST', {
    ...nominal,
    event_id: randomUUID(),
  });
});
test('countermeasure assignment, completion permissions and history', async () => {
  const label = 'Review shared observation ' + randomUUID();
  const a = await call('/cockpit/countermeasures', 'POST', {
      label,
      crew_id: 'brandt',
    }),
    b = await call('/cockpit/countermeasures', 'POST', {
      label,
      crew_id: 'sato',
    });
  assert.notEqual(a.body.id, b.body.id);
  assert.equal(a.body.crew_id, 'brandt');
  assert.equal(b.body.crew_id, 'sato');
  assert.equal(
    (
      await call(
        `/software/crew/brandt/tasks/${b.body.id}`,
        'PATCH',
        { done: true },
        brandt,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/software/crew/brandt/tasks/${a.body.id}`,
        'PATCH',
        { done: true },
        brandt,
      )
    ).status,
    200,
  );
  const tasks = (await call('/software/crew/brandt/tasks', 'GET', null, brandt))
    .body;
  assert.ok(tasks.some((t) => t.id === a.body.id && t.done && t.completed_at));
});
test('acknowledgment and resolution are persisted', async () => {
  const log = await call(
    '/api/v1/pulse/crew/brandt/symptoms',
    'POST',
    { label: 'Audit fatigue', event_id: randomUUID() },
    brandt,
  );
  assert.equal(log.status, 201);
  assert.equal(
    (
      await call(`/cockpit/crew/brandt/alerts/${log.body.id}`, 'PATCH', {
        state: 'acknowledged',
      })
    ).status,
    200,
  );
  let s = (await call('/api/v1/pulse/crew/brandt/state', 'GET', null, brandt))
    .body;
  assert.equal(
    s.active_alerts.find((a) => a.id === log.body.id).state,
    'acknowledged',
  );
  await call(`/cockpit/crew/brandt/alerts/${log.body.id}`, 'PATCH', {
    state: 'resolved',
  });
  s = (await call('/api/v1/pulse/crew/brandt/state', 'GET', null, brandt)).body;
  assert.ok(!s.active_alerts.some((a) => a.id === log.body.id));
});
test('symptom replay is idempotent', async () => {
  const body = { label: 'Replay example', event_id: randomUUID() };
  const a = await call(
      '/api/v1/pulse/crew/brandt/symptoms',
      'POST',
      body,
      brandt,
    ),
    b = await call('/api/v1/pulse/crew/brandt/symptoms', 'POST', body, brandt);
  assert.equal(a.status, 201);
  assert.equal(a.body.id, b.body.id);
});
test('journal is owner-only unless consent is explicit and revocable', async () => {
  const made = await call(
    '/software/crew/brandt/journal',
    'POST',
    { text: 'Private journal ' + randomUUID(), consent: false },
    brandt,
  );
  assert.equal(made.status, 201);
  const id = made.body.id;
  assert.ok(
    (
      await call('/software/crew/brandt/journal', 'GET', null, brandt)
    ).body.some((e) => e.id === id),
  );
  assert.ok(
    !(await call('/software/crew/brandt/journal')).body.some(
      (e) => e.id === id,
    ),
  );
  assert.equal(
    (await call('/software/crew/brandt/journal', 'GET', null, sato)).status,
    403,
  );
  await call(
    `/software/crew/brandt/journal/${id}`,
    'PATCH',
    { consent: true },
    brandt,
  );
  assert.ok(
    (await call('/software/crew/brandt/journal')).body.some((e) => e.id === id),
  );
  await call(
    `/software/crew/brandt/journal/${id}`,
    'PATCH',
    { consent: false },
    brandt,
  );
  assert.ok(
    !(await call('/software/crew/brandt/journal')).body.some(
      (e) => e.id === id,
    ),
  );
  assert.equal(
    (await call(`/software/crew/brandt/journal/${id}`, 'DELETE', null, brandt))
      .status,
    204,
  );
});
test('mission boundaries, raw input and unknown context validation', async () => {
  const before = (await call('/cockpit/mission')).body;
  await call('/cockpit/mission', 'PUT', { mission_day: 301 });
  const r = await core('/crew/brandt/telemetry', 'POST', {
    ...nominal,
    event_id: randomUUID(),
  });
  assert.equal(r.status, 201);
  assert.equal((await core('/crew/brandt/vitals', 'POST', {})).status, 422);
  const invalid = await fetch(ML + '/api/v1/infer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      crew_id: 'brandt',
      crew_code: 'C999',
      steps: [nominal],
    }),
  });
  assert.equal(invalid.status, 422);
  await call('/cockpit/mission', 'PUT', { mission_day: before.mission_day });
});
test('baseline changes hide stale assessments and trigger recovery', async () => {
  const baseline = (await call('/cockpit/crew/brandt/baseline')).body;
  await call('/cockpit/crew/brandt/baseline', 'PUT', {
    hr_bpm: baseline.hr_bpm + 1,
  });
  const stale = (await core('/crew/brandt/state')).body;
  assert.equal(stale.inference_current, false);
  assert.equal(stale.crew_status_badge, null);
  const until = Date.now() + 20000;
  let state;
  do {
    await new Promise((r) => setTimeout(r, 500));
    state = (await core('/crew/brandt/state')).body;
  } while (!state.inference_current && Date.now() < until);
  assert.equal(state.inference_current, true);
  await call('/cockpit/crew/brandt/baseline', 'PUT', {
    hr_bpm: baseline.hr_bpm,
  });
});
test('analytics returns timestamped missing buckets and explicit horizon', async () => {
  await core('/crew/brandt/telemetry', 'POST', {
    ...nominal,
    event_id: randomUUID(),
  });
  const r = await call('/cockpit/crew/brandt/analytics?metric=spo2&window=24h');
  assert.equal(r.status, 200);
  assert.equal(r.body.historical.length, 24);
  assert.equal(r.body.forecast_step_hours, 12);
  assert.equal(r.body.forecast_method, 'experimental_extrapolation');
  assert.equal(r.body.forecast_timestamps.length, 7);
});
test('activity records actors and excludes private journal bodies', async () => {
  const r = await call('/software/activity');
  assert.equal(r.status, 200);
  assert.ok(r.body.some((e) => e.actor === 'brandt'));
  assert.ok(!JSON.stringify(r.body).includes('Private journal '));
});
test('logout revokes the session', async () => {
  const cookie = await login('sato', 'avia-demo-crew');
  assert.equal((await call('/auth/logout', 'POST', null, cookie)).status, 200);
  assert.equal(
    (await call('/api/v1/pulse/crew/sato/state', 'GET', null, cookie)).status,
    401,
  );
});
test('configuration save validates atomically and records baseline version', async () => {
  const original = (await call('/cockpit/crew/brandt/baseline')).body;
  const invalid = await call('/software/crew/brandt/configuration', 'PUT', {
    baseline: { hr_bpm: original.hr_bpm + 1 },
    mission: { mission_day: 1001 },
  });
  assert.equal(invalid.status, 422);
  assert.equal(
    (await call('/cockpit/crew/brandt/baseline')).body.version,
    original.version,
  );
  const saved = await call('/software/crew/brandt/configuration', 'PUT', {
    baseline: { hr_bpm: original.hr_bpm },
    mission: { mission_day: 142 },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.baseline_version, original.version + 1);
});
test('scheduled actions retain UTC due date and completion history', async () => {
  const label = 'Future action ' + randomUUID(),
    date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const made = await call('/cockpit/countermeasures', 'POST', {
    label,
    crew_id: 'brandt',
    scheduled_for: date,
  });
  assert.equal(made.status, 201);
  assert.equal(made.body.scheduled_for, date);
  await call(
    `/software/crew/brandt/tasks/${made.body.id}`,
    'PATCH',
    { done: true },
    brandt,
  );
  const history = await call(
    '/software/crew/brandt/task-history',
    'GET',
    null,
    brandt,
  );
  assert.ok(
    history.body.some(
      (h) => h.task_id === made.body.id && h.actor === 'brandt' && h.done,
    ),
  );
});
test('accepted readings recover after an actual inference-service outage', async (t) => {
  if (process.env.AVIA_TEST_PROJECT !== 'avia-platform-test')
    return t.skip('Requires the isolated test project');
  const container = 'avia-platform-test-agent-1';
  let accepted;
  execFileSync('docker', ['stop', container], { stdio: 'pipe' });
  try {
    const r = await core('/crew/brandt/telemetry', 'POST', {
      ...nominal,
      event_id: randomUUID(),
    });
    assert.equal(r.status, 202);
    assert.equal(r.body.vital_persisted, true);
    assert.equal(r.body.processing_status, 'pending');
    accepted = r.body.submitted_vital_id;
    assert.equal(
      (await core('/crew/brandt/state')).body.inference_current,
      false,
    );
  } finally {
    execFileSync('docker', ['start', container], { stdio: 'pipe' });
  }
  const until = Date.now() + 60000;
  let state;
  do {
    await new Promise((r) => setTimeout(r, 1000));
    state = (await core('/crew/brandt/state')).body;
  } while (!state.inference_current && Date.now() < until);
  assert.equal(state.inference_current, true);
  assert.equal(state.vital_id, accepted);
});
