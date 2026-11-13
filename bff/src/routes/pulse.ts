import type { FastifyPluginAsync } from 'fastify';
import { api, type NewVital } from '../clients/api.js';
import { crewParams } from './schemas.js';

/** Pulse (edge device) wants small payloads: the latest reading, and a way to push new ones. */
const pulseRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/latest',
    { schema: { params: crewParams } },
    async (req) => {
      const [latest] = await api.getVitals(req.params.crewId, 1);
      return { latest: latest ?? null };
    },
  );

  // Raw reading without model inference. Body validation lives in the core API; the BFF forwards and then invalidates
  // the Cockpit's cache. The Pulse app itself uses POST /api/v1/pulse/ingest (routes/v1.ts).
  app.post<{ Params: { crewId: string }; Body: NewVital }>(
    '/crew/:crewId/vitals',
    { schema: { params: crewParams } },
    async (req, reply) => {
      const created = await api.addVital(req.params.crewId, req.body);
      await app.invalidateCockpit();
      return reply.code(201).send(created);
    },
  );
};

export default pulseRoutes;
