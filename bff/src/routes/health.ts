import type { FastifyPluginAsync } from 'fastify';
import { api } from '../clients/api.js';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    const [redis, core] = await Promise.allSettled([app.redis.ping(), api.health()]);
    const body = {
      status: core.status === 'fulfilled' ? 'ok' : 'degraded',
      redis: redis.status === 'fulfilled' ? 'ok' : 'down',
      api: core.status === 'fulfilled' ? 'ok' : 'down',
      db: core.status === 'fulfilled' ? core.value.db : 'unknown',
      ml: core.status === 'fulfilled' ? core.value.ml : 'unknown',
    };
    // Redis is a best-effort cache, so only the core API decides readiness.
    return reply.code(core.status === 'fulfilled' ? 200 : 503).send(body);
  });
};

export default healthRoutes;
