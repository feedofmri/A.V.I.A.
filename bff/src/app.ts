import softwareRoutes from './routes/software.js';
import assistantRoutes from './routes/assistant.js';
import { registerSecurity } from './security.js';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import redis from './plugins/redis.js';
import { ApiError } from './clients/api.js';
import healthRoutes from './routes/health.js';
import cockpitRoutes from './routes/cockpit.js';
import pulseRoutes from './routes/pulse.js';
import v1Routes from './routes/v1.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: config.logLevel } });

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH'],
  });
  await registerSecurity(app);
  app.get('/live', async () => ({ status: 'ok' }));
  await app.register(redis, { url: config.redisUrl });

  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    // Pass upstream API errors through with their original status.
    if (err instanceof ApiError) return reply.code(err.status).send(err.body);
    if ('validation' in err && err.validation) {
      return reply
        .code(422)
        .send({
          error: 'Validation failed',
          message: err.message,
          details: err.validation,
        });
    }
    req.log.error(err);
    const status = err.statusCode ?? 500;
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  await app.register(healthRoutes);
  await app.register(softwareRoutes, { prefix: '/software' });
  await app.register(assistantRoutes, { prefix: '/software' });
  await app.register(cockpitRoutes, { prefix: '/cockpit' });
  await app.register(pulseRoutes, { prefix: '/pulse' });
  await app.register(v1Routes, { prefix: '/api/v1' });

  return app;
}
