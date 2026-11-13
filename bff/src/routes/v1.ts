import type { FastifyPluginAsync } from 'fastify';
import { api, ApiError } from '../clients/api.js';
import { crewParams, pulseTelemetry } from './schemas.js';

/**
 * The public contract from the integration docs, as consumed by client-pulse (src/api/pulse.ts):
 *   GET  /api/v1/health        -> models_loaded lights "Offline · on-board models"
 *   POST /api/v1/pulse/ingest  -> PulseTelemetryRequest in, CockpitStateResponse out
 */
const v1Routes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    try {
      const h = await api.mlHealth();
      return reply.code(h.models_loaded ? 200 : 503).send(h);
    } catch (err) {
      const body =
        err instanceof ApiError ? err.body : { error: (err as Error).message };
      return reply
        .code(503)
        .send({ status: 'offline', models_loaded: false, detail: body });
    }
  });

  app.post<{ Body: Record<string, unknown> & { crew_id: string } }>(
    '/pulse/ingest',
    { schema: { body: pulseTelemetry } },
    async (req, reply) => {
      const { crew_id, ...telemetry } = req.body;
      try {
        const result = await api.ingest(crew_id, telemetry, 'pulse');
        return reply
          .code((result as any).processing_status === 'pending' ? 202 : 201)
          .send(result);
      } finally {
        // Even a 503 (models down) stored the reading, so Cockpit views must refresh either way.
        await app.invalidateCockpit();
      }
    },
  );

  // Pulse hydrates the watch from the stored state on load instead of placeholder values.
  app.get<{ Params: { crewId: string } }>(
    '/pulse/crew/:crewId/state',
    { schema: { params: crewParams } },
    async (req) => {
      const s = await api.state(req.params.crewId);
      return {
        crew_id: s.crew_id,
        active_alerts: s.active_alerts,
        inference_status: s.inference_status,
        symptoms: s.active_alerts.filter((a) => a.kind === 'symptom'),
        recorded_at: s.recorded_at,
        vitals_current: s.vitals_current,
        crew_status_badge: s.crew_status_badge,
        fusion_outputs: s.fusion_outputs,
        why_explanation: s.why_explanation,
        modality_attributions_pct: s.modality_attributions_pct,
        hr_24h_bars: s.hr_24h_bars,
        inference_current: s.inference_current,
      };
    },
  );

  // Symptom logged on the watch -> stored as a (non-model) log entry that shows in the Cockpit Alerts feed.
  app.post<{
    Params: { crewId: string };
    Body: { label: string; event_id?: string };
  }>(
    '/pulse/crew/:crewId/symptoms',
    {
      schema: {
        params: crewParams,
        body: {
          type: 'object',
          required: ['label'],
          properties: {
            event_id: { type: 'string', minLength: 8, maxLength: 128 },
            label: { type: 'string', minLength: 1, maxLength: 120 },
          },
        },
      },
    },
    async (req, reply) => {
      const created = await api.addLog(req.params.crewId, {
        kind: 'symptom',
        label: req.body.label,
        event_id: req.body.event_id,
      });
      await app.invalidateCockpit();
      return reply.code(201).send(created);
    },
  );

  app.post<{ Body: Record<string, unknown> & { crew_id?: string } }>(
    '/suit/evaluate',
    { schema: { body: { type: 'object' } } },
    async (req) => {
      const { crew_id = 'okafor', ...rest } = req.body;
      return api.suit(crew_id, rest);
    },
  );
};

export default v1Routes;
