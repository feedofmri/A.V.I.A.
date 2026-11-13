import type { FastifyPluginAsync } from 'fastify';
import { ml } from '../clients/ml.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  // Readiness: the API is only healthy when it can reach the database. The model status is reported alongside,
  // because the API still stores readings (without inference) while the models are down.
  app.get('/health', async (_req, reply) => {
    const [db, models] = await Promise.allSettled([
      app.db.query('SELECT 1'),
      Promise.race([
        ml.health(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Model health timeout')), 1000),
        ),
      ]),
    ]);
    const body = {
      status: db.status === 'fulfilled' ? 'ok' : 'degraded',
      db: db.status === 'fulfilled' ? 'ok' : 'down',
      ml:
        models.status === 'fulfilled'
          ? models.value.models_loaded
            ? 'ok'
            : 'models_not_loaded'
          : 'down',
    };
    if (db.status === 'rejected') app.log.error(db.reason);
    return reply.code(db.status === 'fulfilled' ? 200 : 503).send(body);
  });

  // Full inference-service status (models_loaded, artifacts, suit availability), for the BFF / Pulse badge.
  app.get('/ml/health', async (_req, reply) => {
    try {
      return await ml.health();
    } catch (err) {
      return reply
        .code(503)
        .send({
          status: 'offline',
          models_loaded: false,
          error: (err as Error).message,
        });
    }
  });
};

export default healthRoutes;
