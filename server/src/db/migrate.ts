/**
 * Applies server/migrations/*.sql in order, once each, recording them in schema_migrations.
 * Connects as the database owner (ADMIN_DATABASE_URL); the API itself connects as the non-owner app role so RLS applies.
 *
 *   npm run db:migrate            (from server/, or `npm run db:migrate` at the repo root)
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { isMain } from './cli.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const LOCK_KEY = 4_242_001;

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function migrate(log: (msg: string) => void = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: config.adminDatabaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    // The app role is normally created by docker/postgres/init; create it here too so migrations work on any database.
    const role = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [config.appDbUser]);
    if (role.rowCount === 0) {
      const pw = await client.query('SELECT quote_literal($1) AS lit', [config.appDbPassword]);
      await client.query(`CREATE ROLE ${ident(config.appDbUser)} LOGIN PASSWORD ${pw.rows[0].lit}`);
      log(`created role ${config.appDbUser}`);
    }

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (done.has(version)) continue;
      const sql = (await readFile(MIGRATIONS_DIR + file, 'utf8')).replaceAll('{{APP_USER}}', ident(config.appDbUser));
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(version);
      log(`applied ${version}`);
    }
    if (applied.length === 0) log('database schema is up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
  return applied;
}

if (isMain(import.meta.url)) {
  migrate().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
