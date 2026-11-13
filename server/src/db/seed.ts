/**
 * Idempotent demo seeder.
 *
 *   npm run db:seed              insert anything that is missing (safe to run repeatedly)
 *   npm run db:seed -- --reseed  delete ONLY seed-generated telemetry/alerts (source='seed' / is_seed) and regenerate
 *
 * Reference data (crew, baselines, mission, checklist, manual log entries) is inserted with ON CONFLICT DO NOTHING,
 * so edits made in Mission setup are never overwritten. Telemetry history goes through the real ingest pipeline
 * (ingestTelemetry -> inference service -> inferences + alerts) as the RLS-restricted app role, so every seeded
 * reading has a genuine model output. Requires the inference service to be up.
 */
import pg from 'pg';
import { config } from '../config.js';
import { ml } from '../clients/ml.js';
import { createDb, type Db } from './pool.js';
import { isMain } from './cli.js';
import { migrate } from './migrate.js';
import { ingestTelemetry, type TelemetryInput } from '../services/telemetry.js';
import {
  EEG,
  LATEST,
  SEED_COUNTERMEASURES,
  SEED_CREW,
  SEED_LOGS,
  SEED_MISSION,
  type SeedCrew,
} from './seed-data.js';

const HOUR = 3_600_000;
const HISTORY_DAYS = 30;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  return { next, normal };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const mix = (a: number, b: number, f: number) => a + (b - a) * f;

/** Every 4 h for days 30..3, then hourly for the last 48 h, ending now. Oldest first. */
export function seedTimes(now: Date): Date[] {
  const times: Date[] = [];
  for (let h = HISTORY_DAYS * 24; h > 48; h -= 4)
    times.push(new Date(now.getTime() - h * HOUR));
  for (let h = 48; h >= 0; h -= 1)
    times.push(new Date(now.getTime() - h * HOUR));
  return times;
}

/** Nightly sleep per day-ago, with the scenario's poor nights (Sato's sleep debt, an Okafor short night). */
function nights(c: SeedCrew, rng: ReturnType<typeof mulberry32>) {
  return Array.from({ length: HISTORY_DAYS + 1 }, (_, d) => {
    let hours = c.baseline.sleep_hr + rng.normal() * 0.25;
    let light = false;
    let delta: number | undefined;
    if (c.slug === 'sato' && (d === 0 || d === 1))
      [hours, light, delta] = [d === 0 ? 4.9 : 5.1, true, 0.55];
    if (c.slug === 'sato' && d === 5) [hours, light] = [5.6, true];
    if (c.slug === 'okafor' && d === 3) [hours, light] = [6.3, true];
    const eeg = { ...(light ? EEG.light : EEG.deep) };
    if (delta !== undefined) eeg.eeg_delta_rel = delta;
    return { hours: r1(clamp(hours, 3, 10)), eeg };
  });
}

export function generateReading(
  c: SeedCrew,
  t: Date,
  now: Date,
  rng: ReturnType<typeof mulberry32>,
  sleep: ReturnType<typeof nights>,
): TelemetryInput {
  const b = c.baseline;
  const hoursAgo = (now.getTime() - t.getTime()) / HOUR;
  const daysAgo = Math.floor(hoursAgo / 24);
  const night = sleep[Math.min(daysAgo, HISTORY_DAYS)];
  const circ = Math.sin((2 * Math.PI * (t.getUTCHours() - 9)) / 24); // afternoon peak

  let hr = b.hr_bpm + 4 * circ + rng.normal() * 2;
  let rmssd = b.rmssd_ms - 3 * circ + rng.normal() * 3;
  let eda = b.eda_us + 0.25 * circ + rng.normal() * 0.12;
  let scr = 10 + 3 * circ + rng.normal() * 2;
  let resp = b.resp_bpm + rng.normal() * 0.7;
  let temp = b.skin_temp_c + rng.normal() * 0.15;
  let spo2 = 98 + rng.normal() * 0.6;

  if (c.slug === 'diaz') {
    // EVA prep in the last 6 h ramps towards the reference case; an earlier EVA rehearsal 4 days ago.
    if (hoursAgo < 6) {
      const f = 1 - hoursAgo / 6;
      [hr, eda, rmssd, scr, resp] = [
        mix(hr, 96, f),
        mix(eda, 5.1, f),
        mix(rmssd, 31, f),
        mix(scr, 35, f),
        mix(resp, 18, f),
      ];
    } else if (
      daysAgo === 4 &&
      t.getUTCHours() >= 13 &&
      t.getUTCHours() <= 16
    ) {
      [hr, eda, rmssd, scr] = [90, 4.4 + rng.normal() * 0.1, 34, 28];
    }
  }
  if (c.slug === 'sato' && daysAgo <= 1) {
    hr += 2;
    rmssd -= 5;
  }

  if (hoursAgo < 0.01) {
    const L = LATEST[c.slug];
    [hr, spo2, eda, rmssd, scr, resp, temp] = [
      L.hr_bpm,
      L.spo2_pct,
      L.eda_tonic_us,
      L.hrv_rmssd_ms,
      L.scr_peaks_min,
      L.resp_rate_bpm,
      L.skin_temp_c,
    ];
  }

  return {
    hr_bpm: Math.round(clamp(hr, 45, 160)),
    spo2_pct: Math.round(clamp(spo2, 94, 100)),
    eda_tonic_us: r2(clamp(eda, 0.5, 15)),
    hrv_rmssd_ms: Math.round(clamp(rmssd, 10, 130)),
    resp_rate_bpm: r1(clamp(resp, 8, 35)),
    scr_peaks_min: Math.round(clamp(scr, 0, 60)),
    skin_temp_c: r1(clamp(temp, 31, 37)),
    sleep_duration_hr:
      hoursAgo < 0.01 ? LATEST[c.slug].sleep_duration_hr : night.hours,
    ...night.eeg,
    mission_day: clamp(SEED_MISSION.mission_day - daysAgo, 1, 300),
    recorded_at: t.toISOString(),
  };
}

async function seedReference(admin: pg.Client, log: (m: string) => void) {
  for (const c of SEED_CREW) {
    const res = await admin.query(
      `INSERT INTO crew_members (id, name, role, slug, initials, baseline_code, sort_order, is_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT DO NOTHING`,
      [c.id, c.name, c.role, c.slug, c.initials, c.baseline_code, c.sort_order],
    );
    const { rows } = await admin.query<{ id: string }>(
      'SELECT id FROM crew_members WHERE slug = $1',
      [c.slug],
    );
    const b = c.baseline;
    const base = await admin.query(
      `INSERT INTO crew_baselines (crew_id, hr_bpm, hr_sd, rmssd_ms, rmssd_sd, sdnn_ms, eda_us, eda_sd, sleep_hr, sleep_sd,
                                   resp_bpm, skin_temp_c, spo2_pct, femoral_bmd, lumbar_bmd, adherence_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (crew_id) DO NOTHING`,
      [
        rows[0].id,
        b.hr_bpm,
        b.hr_sd,
        b.rmssd_ms,
        b.rmssd_sd,
        b.sdnn_ms,
        b.eda_us,
        b.eda_sd,
        b.sleep_hr,
        b.sleep_sd,
        b.resp_bpm,
        b.skin_temp_c,
        b.spo2_pct,
        b.femoral_bmd,
        b.lumbar_bmd,
        b.adherence_pct,
      ],
    );
    log(
      `crew ${c.slug}: ${res.rowCount ? 'inserted' : 'exists'}, baseline ${base.rowCount ? 'inserted' : 'exists'}`,
    );
  }

  const m = SEED_MISSION;
  const mission = await admin.query(
    `INSERT INTO mission (id, name, mission_day, phase, duration_days, orbit_altitude_km) VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [m.name, m.mission_day, m.phase, m.duration_days, m.orbit_altitude_km],
  );
  log(`mission: ${mission.rowCount ? 'inserted' : 'exists'}`);

  const cm = await admin.query(
    'SELECT 1 FROM countermeasures WHERE is_seed LIMIT 1',
  );
  if (cm.rowCount === 0) {
    for (const item of SEED_COUNTERMEASURES) {
      await admin.query(
        `INSERT INTO countermeasures (label, crew_id, source, is_seed)
         VALUES ($1, (SELECT id FROM crew_members WHERE slug = $2), 'seed', true) ON CONFLICT DO NOTHING`,
        [item.label, item.crew ?? null],
      );
    }
    log(`countermeasures: inserted ${SEED_COUNTERMEASURES.length}`);
  } else log('countermeasures: exist');

  let logs = 0;
  for (const l of SEED_LOGS) {
    const exists = await admin.query(
      `SELECT 1 FROM alerts a JOIN crew_members c ON c.id = a.crew_id WHERE c.slug = $1 AND a.kind = $2 AND a.is_seed`,
      [l.crew, l.kind],
    );
    if (exists.rowCount) continue;
    await admin.query(
      `INSERT INTO alerts (crew_id, kind, source, title, detail, severity, model_derived, explanation, first_seen_at, last_seen_at, is_seed)
       VALUES ((SELECT id FROM crew_members WHERE slug = $1), $2, $3, $4, $5, $6, false, $7,
               now() - make_interval(hours => $8), now() - make_interval(hours => $8), true)`,
      [
        l.crew,
        l.kind,
        l.source,
        l.title,
        l.detail,
        l.severity,
        'Manual / device log entry; not produced by an on-board model (no computer-vision or NLP model is part of A.V.I.A.).',
        l.hoursAgo,
      ],
    );
    logs++;
  }
  log(`manual log entries: inserted ${logs}`);
}

async function seedTelemetry(
  admin: pg.Client,
  app: Db,
  log: (m: string) => void,
) {
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const { rows: counts } = await admin.query<{ slug: string; n: number }>(
    `SELECT m.slug, count(v.id)::int AS n FROM crew_members m
       LEFT JOIN vitals v ON v.crew_id = m.id AND v.source = 'seed' WHERE m.slug = ANY($1) GROUP BY m.slug`,
    [SEED_CREW.map((c) => c.slug)],
  );
  const existing = new Map(counts.map((r) => [r.slug, r.n]));
  // Crew members are seeded in parallel; each ingest uses the app pool, not the shared admin client.
  await Promise.all(
    SEED_CREW.map(async (c, idx) => {
      const n = existing.get(c.slug) ?? 0;
      if (n >= seedTimes(now).length) {
        log(`telemetry ${c.slug}: ${n} seeded readings exist, skipped`);
        return;
      }
      await admin.query(
        'INSERT INTO seed_anchors(crew_id,anchor) SELECT id,$2 FROM crew_members WHERE slug=$1 ON CONFLICT DO NOTHING',
        [c.slug, now],
      );
      const anchor = (
        await admin.query(
          'SELECT anchor FROM seed_anchors a JOIN crew_members m ON m.id=a.crew_id WHERE m.slug=$1',
          [c.slug],
        )
      ).rows[0].anchor as Date;
      const rng = mulberry32(1000 + idx);
      const sleep = nights(c, rng);
      const times = seedTimes(anchor);
      let scored = 0;
      for (const t of times) {
        const res = await ingestTelemetry(
          app,
          c.slug,
          {
            ...generateReading(c, t, anchor, rng, sleep),
            event_id: 'seed-' + c.slug + '-' + t.toISOString(),
          },
          'seed',
          { returnState: false, seed: true },
        );
        if (res.status !== 201)
          throw new Error(
            `inference failed while seeding ${c.slug}: ${JSON.stringify(res.body)}`,
          );
        scored++;
      }
      log(
        `telemetry ${c.slug}: ingested ${scored} readings over ${HISTORY_DAYS} days, each scored by the models`,
      );
    }),
  );
}

async function reseed(admin: pg.Client, log: (m: string) => void) {
  const slugs = SEED_CREW.map((c) => c.slug);
  await admin.query(
    'DELETE FROM seed_anchors WHERE crew_id IN (SELECT id FROM crew_members WHERE slug=ANY($1))',
    [slugs],
  );
  const v = await admin.query(
    `DELETE FROM vitals WHERE source = 'seed' AND crew_id IN (SELECT id FROM crew_members WHERE slug = ANY($1))`,
    [slugs],
  );
  const a = await admin.query(
    `DELETE FROM alerts WHERE is_seed AND model_derived AND crew_id IN (SELECT id FROM crew_members WHERE slug = ANY($1))`,
    [slugs],
  );
  log(
    `--reseed: removed ${v.rowCount} seeded readings (with their inferences) and ${a.rowCount} seed-generated alerts`,
  );
}

export async function seed(log: (m: string) => void = console.log) {
  await migrate(log);
  const health = await ml
    .health()
    .catch((e: Error) => ({ models_loaded: false, error: e.message }));
  if (!health.models_loaded) {
    throw new Error(
      `Inference service at ${config.mlUrl} is not ready (${JSON.stringify(health)}). Start it first: ` +
        'docker compose up -d agent   (or: cd agent && uvicorn src.api.main:app --port 8000)',
    );
  }

  const admin = new pg.Client({ connectionString: config.adminDatabaseUrl });
  await admin.connect();
  const app = createDb(config.databaseUrl);
  try {
    if (process.argv.includes('--reseed')) await reseed(admin, log);
    await seedReference(admin, log);
    await seedTelemetry(admin, app, log);
    log('seed complete');
  } finally {
    await admin.end();
    await app.pool.end();
  }
}

if (isMain(import.meta.url)) {
  seed().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
