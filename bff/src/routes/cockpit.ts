import { identity } from '../security.js';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { api, type AlertRow, type CrewState } from '../clients/api.js';
import { cockpitTelemetry, crewParams } from './schemas.js';

export const overviewCacheKey = (crewId: string) =>
  `cockpit:overview:${crewId}`;

type UiStatus = 'nominal' | 'warning' | 'critical' | 'unknown';

const uiStatus = (badge: string | null | undefined): UiStatus =>
  badge === 'Nominal'
    ? 'nominal'
    : badge === 'Warning'
      ? 'warning'
      : badge === 'Critical'
        ? 'critical'
        : 'unknown';

const round = (v: number | null | undefined, digits = 0) =>
  v == null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

/** Mission clock is UTC on board. */
const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);

/** Shape the core CockpitState into the Cockpit's crew-card model (client-cockpit/src/api/bff.ts#CrewMember). */
function crewCard(s: CrewState) {
  return {
    id: s.crew.id,
    uuid: s.crew.uuid,
    initials: s.crew.initials ?? s.crew.name.slice(0, 2).toUpperCase(),
    name: s.crew.name,
    role: s.crew.role,
    status: uiStatus(s.crew_status_badge),
    hr: round(s.vitals_current?.hr_bpm),
    spo2: round(s.vitals_current?.spo2_pct),
    eda: round(s.vitals_current?.eda_us, 1),
    hrv: round(s.vitals_current?.hrv_rmssd_ms),
    sleep: round(s.vitals_current?.sleep_duration_hr, 1),
    hrHistory: s.hr_24h_bars,
    flags: s.model_alerts,
    openAlerts: s.open_alerts_count,
    anomalyScore: s.fusion_outputs?.anomaly_score ?? null,
    whyExplanation: s.why_explanation,
    strainMarkers: s.strain_markers,
    inferenceCurrent: s.inference_current,
    updatedAt: s.recorded_at,
    measurementAgeSeconds: s.measurement_age_seconds,
    provenance: s.provenance,
    imputedFields: s.imputed_fields,
  };
}

/** Shape an alert into the Cockpit's AlertItem model. */
function alertItem(a: AlertRow) {
  return {
    id: String(a.id),
    crewId: a.crew_id,
    crewName: a.crew_name,
    kind: a.kind,
    source: a.source,
    title: a.title,
    detail: a.detail,
    value: a.value ?? '',
    status: a.severity === 'info' ? 'nominal' : a.severity,
    state: a.state,
    time: hhmm(a.last_seen_at),
    timestamp: a.last_seen_at,
    modelDerived: a.model_derived,
    // The docs keep the dermal scan as a static / mocked event (no computer-vision model): flag it in the UI.
    isMock: a.kind === 'dermal_scan',
    contributions: a.contributions,
    explanation: a.explanation ?? a.detail,
  };
}

/** Cockpit (desktop) wants one aggregated payload per screen. */
const cockpitRoutes: FastifyPluginAsync = async (app) => {
  const ttl = config.cacheTtlSeconds;

  // Sidebar + Overview crew cards.
  app.get('/crew', async () =>
    app.cached('cockpit:crew', ttl, async () => {
      const roster = await api.roster();
      const states = await Promise.all(roster.map((c) => api.state(c.slug)));
      return states.map(crewCard);
    }),
  );

  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/state',
    { schema: { params: crewParams } },
    async (req) =>
      app.cached(`cockpit:state:${req.params.crewId}`, ttl, () =>
        api.state(req.params.crewId),
      ),
  );

  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/overview',
    { schema: { params: crewParams } },
    async (req) => {
      const { crewId } = req.params;
      return app.cached(overviewCacheKey(crewId), ttl, async () => {
        const [crew, vitals, state] = await Promise.all([
          api.getCrewMember(crewId),
          api.getVitals(crewId, 100),
          api.state(crewId),
        ]);
        const hr = vitals
          .map((v) => v.heart_rate)
          .filter((n): n is number => n != null);
        return {
          crew,
          latest: vitals[0] ?? null,
          summary: {
            samples: vitals.length,
            avgHeartRate: hr.length
              ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length)
              : null,
          },
          vitals,
          state,
          generatedAt: new Date().toISOString(),
        };
      });
    },
  );

  // Cockpit "Submit vitals" modal (partial readings allowed; the core fills the rest).
  app.post<{ Params: { crewId: string }; Body: Record<string, unknown> }>(
    '/crew/:crewId/telemetry',
    { schema: { params: crewParams, body: cockpitTelemetry } },
    async (req, reply) => {
      try {
        const state = await api.ingest(req.params.crewId, req.body, 'cockpit');
        return reply
          .code((state as any).processing_status === 'pending' ? 202 : 201)
          .send(state);
      } finally {
        await app.invalidateCockpit();
      }
    },
  );

  app.get<{
    Params: { crewId: string };
    Querystring: { metric: string; window: string };
  }>(
    '/crew/:crewId/analytics',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: ['hr', 'spo2', 'eda', 'hrv', 'sleep'],
              default: 'hr',
            },
            window: {
              type: 'string',
              enum: ['24h', '7d', '30d'],
              default: '24h',
            },
          },
        },
      },
    },
    async (req) => {
      const { crewId } = req.params;
      const { metric, window } = req.query;
      return app.cached(
        `cockpit:analytics:${crewId}:${metric}:${window}`,
        ttl,
        () => api.analytics(crewId, metric, window),
      );
    },
  );

  // Digital twin: the WHAT-IF adherence slider re-evaluates the projection on every change, so it is not cached.
  app.get<{ Params: { crewId: string }; Querystring: { adherence?: number } }>(
    '/crew/:crewId/twin',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            adherence: { type: 'number', minimum: 0, maximum: 100 },
          },
        },
      },
    },
    async (req) => api.twin(req.params.crewId, req.query.adherence),
  );

  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/baseline',
    { schema: { params: crewParams } },
    async (req) => api.baseline(req.params.crewId),
  );

  app.put<{ Params: { crewId: string }; Body: Record<string, number> }>(
    '/crew/:crewId/baseline',
    {
      schema: {
        params: crewParams,
        body: {
          type: 'object',
          additionalProperties: { type: 'number' },
          minProperties: 1,
        },
      },
    },
    async (req) => {
      const updated = await api.updateBaseline(req.params.crewId, req.body);
      await app.invalidateCockpit();
      return updated;
    },
  );

  app.get<{ Querystring: { state?: 'active' | 'all' } }>(
    '/alerts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['active', 'all'],
              default: 'active',
            },
          },
        },
      },
    },
    async (req) =>
      app.cached('cockpit:alerts:' + req.query.state, ttl, async () =>
        (await api.alerts(req.query.state ?? 'active')).map(alertItem),
      ),
  );

  app.patch<{
    Params: { crewId: string; alertId: number };
    Body: { state: string };
  }>(
    '/crew/:crewId/alerts/:alertId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['crewId', 'alertId'],
          properties: {
            ...crewParams.properties,
            alertId: { type: 'integer' },
          },
        },
        body: {
          type: 'object',
          required: ['state'],
          properties: {
            state: {
              type: 'string',
              enum: ['open', 'acknowledged', 'resolved'],
            },
          },
        },
      },
    },
    async (req) => {
      const res = await api.setAlertState(
        req.params.crewId,
        req.params.alertId,
        req.body.state,
      );
      await app.invalidateCockpit();
      return res;
    },
  );

  app.get('/mission', async () =>
    app.cached('cockpit:mission', ttl, () => api.mission()),
  );

  app.put<{ Body: Record<string, unknown> }>(
    '/mission',
    { schema: { body: { type: 'object', minProperties: 1 } } },
    async (req) => {
      const updated = await api.updateMission(req.body);
      await app.invalidateCockpit();
      return updated;
    },
  );

  app.get('/countermeasures', async () => {
    const all = await api.countermeasures();
    const user = identity.getStore();
    return user?.role === 'crew'
      ? all.filter((t) => t.crew_id === user.crew)
      : all;
  });

  app.post<{
    Body: {
      label: string;
      crew_id?: string;
      source?: string;
      scheduled_for?: string;
    };
  }>(
    '/countermeasures',
    {
      schema: {
        body: {
          type: 'object',
          required: ['label'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 200 },
            crew_id: { type: 'string' },
            source: { type: 'string' },
            scheduled_for: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await api.addCountermeasure(req.body)),
  );

  app.patch<{ Params: { id: number }; Body: { done: boolean } }>(
    '/countermeasures/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'integer' } },
        },
        body: {
          type: 'object',
          required: ['done'],
          properties: { done: { type: 'boolean' } },
        },
      },
    },
    async (req) => api.setCountermeasure(req.params.id, req.body.done),
  );
};

export default cockpitRoutes;
