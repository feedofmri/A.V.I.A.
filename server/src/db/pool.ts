import pg from 'pg';

// numeric/decimal columns (spo2, eda) arrive as strings by default; the API serves numbers.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) =>
  v === null ? null : Number(v),
);
pg.types.setTypeParser(pg.types.builtins.INT8, (v) =>
  v === null ? null : Number(v),
);
// Plain dates stay 'YYYY-MM-DD' instead of becoming a local-midnight Date shifted by the host timezone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export interface Db {
  pool: pg.Pool;
  /** Run `fn` in a transaction scoped to one crew member, so RLS policies apply. */
  withCrew<T>(
    crewId: string,
    fn: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T>;
  /** Run `fn` in a plain transaction (mission-wide tables). */
  tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
}

export function createDb(connectionString: string): Db {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 30000,
  });

  async function tx<T>(
    fn: (client: pg.PoolClient) => Promise<T>,
    crewId?: string,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (crewId)
        await client.query("SELECT set_config('app.crew_id', $1, true)", [
          crewId,
        ]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return { pool, withCrew: (crewId, fn) => tx(fn, crewId), tx: (fn) => tx(fn) };
}
