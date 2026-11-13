// End-to-end checks through the BFF (the only API the clients call): BFF -> core API -> PostgreSQL / inference service.
// Requires a running, seeded stack.   BFF_URL=http://localhost:4000 npm run test:e2e
// Writes go to the real database; every test restores the demo state it changes (the reference cases ARE the
// seeded "latest" readings, so re-ingesting them leaves the dashboards as seeded).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BFF = process.env.BFF_URL ?? 'http://localhost:4000';
const login = await fetch(BFF + '/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: 'operator',
    password: process.env.TEST_OPERATOR_PASSWORD ?? 'avia-demo-operator',
  }),
});
assert.equal(login.status, 200, 'Operator test login');
const cookie = login.headers.get('set-cookie').split(';')[0];

async function call(method, path, body) {
  const res = await fetch(BFF + path, {
    method,
    headers: {
      cookie,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

// AIVI_model_to_UI.docx §11.1 reference cases, as the Pulse drawer presets send them.
const DEEP = {
  eeg_delta_rel: 0.9302,
  eeg_theta_rel: 0.0517,
  eeg_sigma_rel: 0.0048,
  eeg_beta_rel: 0.0014,
  eog_std_uv: 18.16,
};
const LIGHT = {
  eeg_delta_rel: 0.55,
  eeg_theta_rel: 0.2359,
  eeg_sigma_rel: 0.0196,
  eeg_beta_rel: 0.0321,
  eog_std_uv: 19.66,
};
const CASE1 = {
  crew_id: 'brandt',
  mission_day: 142,
  hr_bpm: 61,
  spo2_pct: 98,
  eda_tonic_us: 1.9,
  hrv_rmssd_ms: 62,
  sleep_duration_hr: 7.5,
  scr_peaks_min: 9,
  resp_rate_bpm: 14,
  skin_temp_c: 33.8,
  ...DEEP,
};
const CASE2 = {
  crew_id: 'sato',
  mission_day: 142,
  hr_bpm: 68,
  spo2_pct: 98,
  eda_tonic_us: 2.1,
  hrv_rmssd_ms: 46,
  sleep_duration_hr: 4.9,
  scr_peaks_min: 12,
  resp_rate_bpm: 15,
  skin_temp_c: 33.9,
  ...LIGHT,
};
const CASE3 = {
  crew_id: 'diaz',
  mission_day: 142,
  hr_bpm: 96,
  spo2_pct: 97,
  eda_tonic_us: 5.1,
  hrv_rmssd_ms: 31,
  sleep_duration_hr: 7.2,
  scr_peaks_min: 35,
  resp_rate_bpm: 18,
  skin_temp_c: 34.3,
  ...DEEP,
};

test('health: BFF, core, database and models are up', async () => {
  const h = await call('GET', '/health');
  assert.equal(h.status, 200);
  assert.deepEqual([h.body.api, h.body.db, h.body.ml], ['ok', 'ok', 'ok']);
  const v1 = await call('GET', '/api/v1/health');
  assert.equal(v1.status, 200);
  assert.equal(v1.body.models_loaded, true);
});

test('seeded crew is served from the database with model status', async () => {
  const { status, body } = await call('GET', '/cockpit/crew');
  assert.equal(status, 200);
  assert.deepEqual(
    body.map((c) => c.id),
    ['okafor', 'brandt', 'sato', 'diaz'],
  );
  for (const c of body) {
    assert.equal(c.hrHistory.length, 24);
    assert.ok(
      ['nominal', 'warning', 'critical'].includes(c.status),
      `${c.id} has a model status`,
    );
  }
});

test('case 1: nominal Brandt -> Nominal, no model flags', async () => {
  const { status, body } = await call('POST', '/api/v1/pulse/ingest', CASE1);
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.crew_status_badge, 'Nominal');
  assert.ok(body.fusion_outputs.anomaly_score < 0.4);
  assert.deepEqual(body.model_alerts, []);
  assert.equal(body.hr_24h_bars.at(-1), 61);
});

test('case 2: Sato sleep debt -> Warning + PULSE SLEEP alert', async () => {
  const { status, body } = await call('POST', '/api/v1/pulse/ingest', CASE2);
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.crew_status_badge, 'Warning');
  assert.equal(body.personal_z_scores.Sleep_z, -3.83);
  assert.ok(body.active_alerts.some((a) => a.source === 'PULSE SLEEP'));
});

test('case 3: Diaz EVA stress -> Warning, stress > 0.80, stress-led attribution', async () => {
  const { status, body } = await call('POST', '/api/v1/pulse/ingest', CASE3);
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.crew_status_badge, 'Warning');
  assert.ok(body.fusion_outputs.stress_score > 0.8);
  assert.equal(body.personal_z_scores.EDA_z, 3.63);
  const top = Object.entries(body.modality_attributions_pct).sort(
    (a, b) => b[1] - a[1],
  )[0][0];
  assert.equal(top, 'Stress');
  assert.equal(body.analytics_forecast_7step.eda_tonic_us.values.length, 7);
});

test('alerts resolve when the condition clears and return when it recurs', async () => {
  const calm = await call('POST', '/api/v1/pulse/ingest', {
    ...CASE3,
    hr_bpm: 70,
    eda_tonic_us: 2.1,
    hrv_rmssd_ms: 48,
    scr_peaks_min: 10,
    resp_rate_bpm: 15,
  });
  assert.equal(calm.status, 201);
  assert.ok(
    !calm.body.active_alerts.some((a) => a.kind === 'stress'),
    'stress alert auto-resolved',
  );
  const feed = await call('GET', '/cockpit/alerts');
  assert.ok(
    !feed.body.some((a) => a.crewId === 'diaz' && a.kind === 'stress'),
    'cockpit cache invalidated',
  );
  const again = await call('POST', '/api/v1/pulse/ingest', CASE3);
  assert.ok(again.body.active_alerts.some((a) => a.kind === 'stress'));
});

test('validation: out-of-range telemetry is 422, unknown crew is 404, missing required field is 422', async () => {
  assert.equal(
    (await call('POST', '/api/v1/pulse/ingest', { ...CASE1, hr_bpm: 260 }))
      .status,
    422,
  );
  assert.equal(
    (
      await call('POST', '/api/v1/pulse/ingest', {
        ...CASE1,
        crew_id: 'nobody',
      })
    ).status,
    404,
  );
  const { sleep_duration_hr, ...noSleep } = CASE1;
  assert.equal(
    (await call('POST', '/api/v1/pulse/ingest', noSleep)).status,
    422,
  );
});

test('cockpit quick entry accepts a partial reading and fills the rest server-side', async () => {
  const { status, body } = await call(
    'POST',
    '/cockpit/crew/brandt/telemetry',
    { hr_bpm: 62, spo2_pct: 98, resp_rate_bpm: 14, skin_temp_c: 33.8 },
  );
  assert.equal(status, 201, JSON.stringify(body));
  assert.ok(body.imputed_fields.includes('sleep_duration_hr'));
  assert.equal(body.vitals_current.sleep_duration_hr, 7.5); // carried forward from Brandt's last reading
  await call('POST', '/api/v1/pulse/ingest', CASE1); // restore the seeded latest reading
});

test('analytics returns stored history plus the 7-step model forecast', async () => {
  const { status, body } = await call(
    'GET',
    '/cockpit/crew/diaz/analytics?metric=eda&window=24h',
  );
  assert.equal(status, 200);
  assert.ok(body.historical.length > 0 && body.historical.length <= 24);
  assert.equal(body.forecast_7step.length, 7);
  assert.equal(body.forecast_end, body.forecast_7step.at(-1));
});

test('digital twin: lower adherence brings the skeletal warning earlier', async () => {
  const hi = await call('GET', '/cockpit/crew/okafor/twin?adherence=90');
  const lo = await call('GET', '/cockpit/crew/okafor/twin?adherence=20');
  assert.equal(hi.status, 200);
  assert.ok(
    lo.body.skeletal_risk_projection.warning_in_days <
      hi.body.skeletal_risk_projection.warning_in_days,
  );
});

test('baseline and mission updates persist (and are restored)', async () => {
  const before = (await call('GET', '/cockpit/crew/sato/baseline')).body;
  const put = await call('PUT', '/cockpit/crew/sato/baseline', { hr_bpm: 67 });
  assert.equal(put.status, 200);
  assert.equal(
    (await call('GET', '/cockpit/crew/sato/baseline')).body.hr_bpm,
    67,
  );
  await call('PUT', '/cockpit/crew/sato/baseline', { hr_bpm: before.hr_bpm });

  const mission = (await call('GET', '/cockpit/mission')).body;
  assert.equal(
    (
      await call('PUT', '/cockpit/mission', {
        mission_day: mission.mission_day + 1,
      })
    ).body.mission_day,
    mission.mission_day + 1,
  );
  await call('PUT', '/cockpit/mission', { mission_day: mission.mission_day });
});

test('countermeasure checklist toggles persist', async () => {
  const list = (await call('GET', '/cockpit/countermeasures')).body;
  assert.ok(list.length >= 4);
  const item = list[0];
  assert.equal(
    (
      await call('PATCH', `/cockpit/countermeasures/${item.id}`, {
        done: !item.done,
      })
    ).body.done,
    !item.done,
  );
  await call('PATCH', `/cockpit/countermeasures/${item.id}`, {
    done: item.done,
  });
});

test('suit swelling model: nominal suit vs left forearm breach (Digital_Twin_3D presets)', async () => {
  const h = (await call('GET', '/api/v1/health')).body;
  assert.equal(h.models.suit_swelling_encoder, true, h.suit_unavailable_reason);
  const nominal = await call('POST', '/api/v1/suit/evaluate', {
    crew_id: 'okafor',
  });
  assert.equal(nominal.status, 200, JSON.stringify(nominal.body));
  assert.equal(nominal.body.predicted_zone_id, 0);
  assert.equal(nominal.body.digital_twin_body_map.left_forearm, 'Nominal');
  const breach = await call('POST', '/api/v1/suit/evaluate', {
    crew_id: 'okafor',
    suit_p_left_arm_psi: 2.3,
    bioimp_left_arm_ohm: 250,
  });
  assert.equal(breach.body.predicted_zone_id, 1);
  assert.equal(breach.body.digital_twin_body_map.left_forearm, 'Critical');
  assert.equal(breach.body.swelling_pct_by_region.left_forearm, 18);
  assert.equal(
    (
      await call('POST', '/api/v1/suit/evaluate', {
        crew_id: 'okafor',
        suit_p_torso_psi: 9,
      })
    ).status,
    422,
  );
});
