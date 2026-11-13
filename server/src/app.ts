import software from './routes/software.js';
import assistant from './routes/assistant.js';
import { startRecovery } from './services/recovery.js';
import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyError } from 'fastify';
import { config } from './config.js';
import db from './plugins/db.js';
import { MlError } from './clients/ml.js';
import { HttpError } from './errors.js';
import healthRoutes from './routes/health.js';
import crewRoutes from './routes/crew.js';
import missionRoutes from './routes/mission.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.get('/live', async () => ({ status: 'ok' }));
  app.addHook('onRequest', async (req, reply) => {
    if (['/live', '/health'].includes(req.url.split('?')[0])) return;
    const expected = process.env.INTERNAL_API_TOKEN;
    const actual = String(req.headers['x-internal-token'] ?? '');
    if (
      !expected ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      return reply
        .code(401)
        .send({ error: 'Internal service authorization required' });
  });
  app.setErrorHandler((err: FastifyError | HttpError | MlError, req, reply) => {
    if ('validation' in err && err.validation) {
      // 422 for out-of-range telemetry (AIVI doc §10: "a safe 422 validation response").
      return reply
        .code(422)
        .send({
          error: 'Validation failed',
          message: err.message,
          details: err.validation,
        });
    }
    if (err instanceof HttpError)
      return reply.code(err.status).send({ error: err.message, ...err.extra });
    if (err instanceof MlError) {
      const status = err.status >= 500 || err.status === 422 ? err.status : 502;
      return reply
        .code(status)
        .send({ error: 'Inference service error', detail: err.detail });
    }
    req.log.error(err);
    const status = (err as FastifyError).statusCode ?? 500;
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  await app.register(db, { connectionString: config.databaseUrl });
  await app.register(healthRoutes);
  await app.register(software);
  await app.register(assistant);
  app.addHook('onResponse', async (req, reply) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      reply.statusCode < 400
    ) {
      // Never record raw request bodies, symptoms, journal text or credentials.
      await app.db
        .query(
          'INSERT INTO activity_history(actor,action,resource,detail) VALUES($1,$2,$3,$4)',
          [
            String(req.headers['x-actor'] ?? 'internal'),
            req.method,
            req.url.split('?')[0],
            JSON.stringify({
              status: reply.statusCode,
              state: (req.body as { state?: string })?.state,
              done: (req.body as { done?: boolean })?.done,
            }),
          ],
        )
        .catch((e) => app.log.error(e));
    }
  });
  const stop = startRecovery(app.dbx, (e) => app.log.error(e));
  app.addHook('onClose', async () => stop());
  await app.register(crewRoutes, { prefix: '/crew' });
  await app.register(missionRoutes);

  return app;
}
