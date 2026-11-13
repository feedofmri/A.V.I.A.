import type { Db } from '../db/pool.js';
import { HttpError, notFound } from '../errors.js';

export interface Mission {
  name: string;
  mission_day: number;
  phase: string;
  duration_days: number;
  orbit_altitude_km: number | null;
  updated_at: string;
}

const COLUMNS = [
  'name',
  'mission_day',
  'phase',
  'duration_days',
  'orbit_altitude_km',
] as const;

export async function getMission(db: Db): Promise<Mission> {
  const { rows } = await db.pool.query<Mission>(
    'SELECT name, mission_day, phase, duration_days, orbit_altitude_km, updated_at FROM mission WHERE id = 1',
  );
  if (rows.length === 0)
    throw new HttpError(
      409,
      'Mission parameters not configured; run the seeder',
    );
  return rows[0];
}

export async function updateMission(
  db: Db,
  patch: Partial<Record<(typeof COLUMNS)[number], string | number>>,
): Promise<Mission> {
  const keys = COLUMNS.filter((k) => patch[k] !== undefined);
  if (keys.length === 0)
    throw new HttpError(422, 'No mission fields to update');
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const { rows } = await db.pool.query<Mission>(
    `UPDATE mission SET ${sets}, updated_at = now(), version=version+1 WHERE id = 1
     RETURNING name, mission_day, phase, duration_days, orbit_altitude_km, updated_at`,
    keys.map((k) => patch[k]),
  );
  if (rows.length === 0) throw notFound('Mission');
  return rows[0];
}
