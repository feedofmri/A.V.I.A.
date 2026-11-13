import type { FastifyPluginAsync } from 'fastify';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { resolveCrew, BASELINE_COLUMNS } from '../services/crew.js';
import { baselineProps } from './crew.js';
import { HttpError } from '../errors.js';

const key = createHash('sha256')
  .update(
    process.env.JOURNAL_KEY ??
      'avia-local-demo-journal-key-change-before-sharing',
  )
  .digest();
function encrypt(text: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  return [
    iv.toString('base64'),
    cipher.update(text, 'utf8', 'base64') + cipher.final('base64'),
    cipher.getAuthTag().toString('base64'),
  ].join('.');
}
function decrypt(text: string) {
  const [iv, data, tag] = text.split('.');
  const cipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
  );
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return cipher.update(data, 'base64', 'utf8') + cipher.final('utf8');
}
const params = {
  type: 'object',
  required: ['crewId'],
  properties: { crewId: { type: 'string', pattern: '^[a-z0-9-]{2,64}$' } },
};
const journalParams = {
  type: 'object',
  required: ['crewId', 'id'],
  properties: { ...params.properties, id: { type: 'string', format: 'uuid' } },
};
const missionProperties = {
  name: { type: 'string', minLength: 1, maxLength: 80 },
  mission_day: { type: 'integer', minimum: 1, maximum: 1000 },
  phase: { type: 'string', minLength: 1, maxLength: 40 },
  duration_days: { type: 'integer', minimum: 1, maximum: 2000 },
  orbit_altitude_km: { type: 'integer', minimum: 0, maximum: 1000000 },
};
const software: FastifyPluginAsync = async (app) => {
  app.put<{
    Params: { crewId: string };
    Body: {
      baseline: Record<string, number>;
      mission: Record<string, string | number>;
    };
  }>(
    '/crew/:crewId/configuration',
    {
      schema: {
        params,
        body: {
          type: 'object',
          required: ['baseline', 'mission'],
          additionalProperties: false,
          properties: {
            baseline: {
              type: 'object',
              additionalProperties: false,
              properties: baselineProps,
            },
            mission: {
              type: 'object',
              additionalProperties: false,
              properties: missionProperties,
            },
          },
        },
      },
    },
    async (req) => {
      if (req.headers['x-role'] !== 'operator')
        throw new HttpError(403, 'Operator permission required');
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      return app.withCrew(crew.id, async (c) => {
        const baselineKeys = BASELINE_COLUMNS.filter(
          (k) => req.body.baseline[k] !== undefined,
        );
        const missionKeys = Object.keys(missionProperties).filter(
          (k) => req.body.mission[k] !== undefined,
        );
        if (baselineKeys.length)
          await c.query(
            'UPDATE crew_baselines SET ' +
              baselineKeys.map((k, i) => k + '=$' + (i + 2)).join(',') +
              ',version=version+1,updated_at=now() WHERE crew_id=$1',
            [crew.id, ...baselineKeys.map((k) => req.body.baseline[k])],
          );
        if (missionKeys.length)
          await c.query(
            'UPDATE mission SET ' +
              missionKeys.map((k, i) => k + '=$' + (i + 1)).join(',') +
              ',version=version+1,updated_at=now() WHERE id=1',
            missionKeys.map((k) => req.body.mission[k]),
          );
        return {
          saved: true,
          baseline_version: (
            await c.query(
              'SELECT version FROM crew_baselines WHERE crew_id=$1',
              [crew.id],
            )
          ).rows[0].version,
        };
      });
    },
  );
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/task-history',
    { schema: { params } },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      return app.withCrew(
        crew.id,
        async (c) =>
          (
            await c.query(
              'SELECT * FROM task_history ORDER BY id DESC LIMIT 200',
            )
          ).rows,
      );
    },
  );
  app.get(
    '/activity',
    async () =>
      (
        await app.db.query(
          'SELECT * FROM activity_history ORDER BY id DESC LIMIT 200',
        )
      ).rows,
  );
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/journal',
    { schema: { params } },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId),
        owner =
          req.headers['x-role'] === 'crew' &&
          req.headers['x-crew'] === crew.slug;
      return app.withCrew(crew.id, async (c) =>
        (
          await c.query(
            'SELECT * FROM journals ORDER BY created_at DESC LIMIT 100',
          )
        ).rows
          .filter((r) => owner || r.consent)
          .map(({ ciphertext, ...r }) => ({ ...r, text: decrypt(ciphertext) })),
      );
    },
  );
  app.post<{
    Params: { crewId: string };
    Body: { text: string; consent: boolean };
  }>(
    '/crew/:crewId/journal',
    {
      schema: {
        params,
        body: {
          type: 'object',
          required: ['text', 'consent'],
          additionalProperties: false,
          properties: {
            text: { type: 'string', minLength: 1, maxLength: 10000 },
            consent: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      if (
        req.headers['x-role'] !== 'crew' ||
        req.headers['x-crew'] !== crew.slug
      )
        throw new HttpError(
          403,
          'Only the crew member can create a private journal entry',
        );
      const row = await app.withCrew(
        crew.id,
        async (c) =>
          (
            await c.query(
              'INSERT INTO journals(crew_id,ciphertext,consent) VALUES($1,$2,$3) RETURNING id,consent,created_at',
              [crew.id, encrypt(req.body.text), req.body.consent],
            )
          ).rows[0],
      );
      return reply.code(201).send(row);
    },
  );
  app.patch<{
    Params: { crewId: string; id: string };
    Body: { consent: boolean };
  }>(
    '/crew/:crewId/journal/:id',
    {
      schema: {
        params: journalParams,
        body: {
          type: 'object',
          required: ['consent'],
          additionalProperties: false,
          properties: { consent: { type: 'boolean' } },
        },
      },
    },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      if (
        req.headers['x-role'] !== 'crew' ||
        req.headers['x-crew'] !== crew.slug
      )
        throw new HttpError(403, 'Only the owner can change consent');
      const row = await app.withCrew(
        crew.id,
        async (c) =>
          (
            await c.query(
              'UPDATE journals SET consent=$1,updated_at=now() WHERE id=$2 RETURNING id,consent',
              [req.body.consent, req.params.id],
            )
          ).rows[0],
      );
      if (!row) throw new HttpError(404, 'Journal not found');
      return row;
    },
  );
  app.delete<{ Params: { crewId: string; id: string } }>(
    '/crew/:crewId/journal/:id',
    { schema: { params: journalParams } },
    async (req, reply) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      if (
        req.headers['x-role'] !== 'crew' ||
        req.headers['x-crew'] !== crew.slug
      )
        throw new HttpError(403, 'Only the owner can delete an entry');
      const row = await app.withCrew(crew.id, (c) =>
        c.query('DELETE FROM journals WHERE id=$1 RETURNING id', [
          req.params.id,
        ]),
      );
      if (!row.rowCount) throw new HttpError(404, 'Journal not found');
      return reply.code(204).send();
    },
  );
};
export default software;
