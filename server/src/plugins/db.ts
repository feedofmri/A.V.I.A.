import fp from 'fastify-plugin';
import type pg from 'pg';
import { createDb, type Db } from '../db/pool.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
    /** Run `fn` in a transaction scoped to one crew member, so RLS policies apply. */
    withCrew: Db['withCrew'];
    /** Run `fn` in a plain transaction (mission-wide tables). */
    tx: Db['tx'];
    dbx: Db;
  }
}

export default fp<{ connectionString: string }>(async (app, opts) => {
  const db = createDb(opts.connectionString);

  app.decorate('db', db.pool);
  app.decorate('withCrew', db.withCrew);
  app.decorate('tx', db.tx);
  app.decorate('dbx', db);

  app.addHook('onClose', () => db.pool.end());
});
