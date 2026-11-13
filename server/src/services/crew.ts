import type pg from 'pg';
import type { Db } from '../db/pool.js';
import { HttpError, notFound } from '../errors.js';
import type { MlBaseline } from '../clients/ml.js';

export interface CrewRef {
  id: string; // uuid
  slug: string;
  name: string;
  role: string;
  initials: string | null;
  baseline_code: string | null;
  sort_order: number;
}

export interface Baseline extends MlBaseline {
  femoral_bmd: number;
  lumbar_bmd: number;
  adherence_pct: number;
  updated_at: string;
  version: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function roster(db: Db): Promise<CrewRef[]> {
  const { rows } = await db.pool.query<CrewRef>('SELECT * FROM crew_roster()');
  return rows;
}

/** Accepts the UI slug ("okafor") or the crew member's uuid. */
export async function resolveCrew(db: Db, ref: string): Promise<CrewRef> {
  const key = ref.toLowerCase();
  const crew = (await roster(db)).find(
    (c) => c.slug === key || (UUID.test(ref) && c.id === key),
  );
  if (!crew) throw notFound(`Crew member '${ref}'`);
  return crew;
}

export const BASELINE_COLUMNS = [
  'hr_bpm',
  'hr_sd',
  'rmssd_ms',
  'rmssd_sd',
  'sdnn_ms',
  'eda_us',
  'eda_sd',
  'sleep_hr',
  'sleep_sd',
  'resp_bpm',
  'skin_temp_c',
  'spo2_pct',
  'femoral_bmd',
  'lumbar_bmd',
  'adherence_pct',
] as const;

export async function getBaseline(
  client: pg.PoolClient,
  crew: CrewRef,
): Promise<Baseline> {
  const { rows } = await client.query<Baseline>(
    'SELECT * FROM crew_baselines WHERE crew_id = $1',
    [crew.id],
  );
  if (rows.length === 0) {
    throw new HttpError(
      409,
      `No personal baseline stored for ${crew.slug}; run the seeder or PUT /crew/${crew.slug}/baseline`,
    );
  }
  return rows[0];
}

export function toMlBaseline(b: Baseline): MlBaseline {
  return {
    hr_bpm: b.hr_bpm,
    hr_sd: b.hr_sd,
    rmssd_ms: b.rmssd_ms,
    rmssd_sd: b.rmssd_sd,
    sdnn_ms: b.sdnn_ms,
    eda_us: b.eda_us,
    eda_sd: b.eda_sd,
    sleep_hr: b.sleep_hr,
    sleep_sd: b.sleep_sd,
    resp_bpm: b.resp_bpm,
    skin_temp_c: b.skin_temp_c,
    spo2_pct: b.spo2_pct,
  };
}

export async function updateBaseline(
  db: Db,
  crew: CrewRef,
  patch: Partial<Record<(typeof BASELINE_COLUMNS)[number], number>>,
): Promise<Baseline> {
  const keys = BASELINE_COLUMNS.filter((k) => patch[k] !== undefined);
  if (keys.length === 0)
    throw new HttpError(422, 'No baseline fields to update');
  return db.withCrew(crew.id, async (c) => {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await c.query<Baseline>(
      `UPDATE crew_baselines SET ${sets}, updated_at = now(), version = version + 1 WHERE crew_id = $1 RETURNING *`,
      [crew.id, ...keys.map((k) => patch[k])],
    );
    if (rows.length === 0) throw notFound(`Baseline for ${crew.slug}`);
    return rows[0];
  });
}
