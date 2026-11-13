import type { FastifyPluginAsync } from 'fastify';
import {
  BASELINE_COLUMNS,
  getBaseline,
  resolveCrew,
  roster,
  updateBaseline,
} from '../services/crew.js';
import {
  ingestTelemetry,
  crewState,
  TELEMETRY_SCHEMA,
  type ReadingSource,
  type TelemetryInput,
} from '../services/telemetry.js';
import {
  addLog,
  analytics,
  METRICS,
  setAlertState,
  twin,
  WINDOWS,
  listAlerts,
} from '../services/insights.js';
import { ml } from '../clients/ml.js';

/** Crew slug ("okafor") or uuid. */
const crewParams = {
  type: 'object',
  required: ['crewId'],
  properties: { crewId: { type: 'string', pattern: '^[A-Za-z0-9-]{2,64}$' } },
} as const;

interface CrewParams {
  crewId: string;
}

interface VitalsBody {
  heartRate?: number;
  spo2?: number;
  eda?: number;
  recordedAt?: string;
}

const VITAL_COLUMNS = `id, recorded_at, heart_rate, spo2, eda, hrv_rmssd_ms, hrv_sdnn_ms, resp_rate_bpm, scr_peaks_min,
  skin_temp_c, sleep_duration_hr, eeg_delta_rel, eeg_theta_rel, eeg_sigma_rel, eeg_beta_rel, eog_std_uv, mission_day,
  mission_timepoint, source, imputed_fields`;

export const baselineProps = Object.fromEntries(
  BASELINE_COLUMNS.map((k) => [k, { type: 'number' }]),
);
Object.assign(baselineProps, {
  hr_bpm: { type: 'number', minimum: 30, maximum: 120 },
  rmssd_ms: { type: 'number', minimum: 5, maximum: 150 },
  sdnn_ms: { type: 'number', minimum: 10, maximum: 200 },
  eda_us: { type: 'number', minimum: 0.05, maximum: 40 },
  sleep_hr: { type: 'number', minimum: 3, maximum: 12 },
  resp_bpm: { type: 'number', minimum: 6, maximum: 45 },
  skin_temp_c: { type: 'number', minimum: 25, maximum: 41 },
  spo2_pct: { type: 'number', minimum: 80, maximum: 100 },
  femoral_bmd: { type: 'number', minimum: 0.3, maximum: 2 },
  lumbar_bmd: { type: 'number', minimum: 0.3, maximum: 2 },
  adherence_pct: { type: 'number', minimum: 0, maximum: 100 },
  hr_sd: { type: 'number', exclusiveMinimum: 0 },
  rmssd_sd: { type: 'number', exclusiveMinimum: 0 },
  eda_sd: { type: 'number', exclusiveMinimum: 0 },
  sleep_sd: { type: 'number', exclusiveMinimum: 0 },
});

const crewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => roster(app.dbx));

  app.get<{ Params: CrewParams }>(
    '/:crewId',
    { schema: { params: crewParams } },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      const { rows } = await app.withCrew(crew.id, (c) =>
        c.query(
          'SELECT id, slug, name, role, initials, baseline_code, created_at FROM crew_members WHERE id = $1',
          [crew.id],
        ),
      );
      return rows[0];
    },
  );

  // ---------------------------------------------------------------- baselines
  app.get<{ Params: CrewParams }>(
    '/:crewId/baseline',
    { schema: { params: crewParams } },
    async (req, reply) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      const { rows } = await app.withCrew(crew.id, (c) =>
        c.query('SELECT * FROM crew_baselines WHERE crew_id = $1', [crew.id]),
      );
      if (rows.length === 0)
        return reply
          .code(404)
          .send({ error: `No baseline stored for ${crew.slug}` });
      return rows[0];
    },
  );

  app.put<{ Params: CrewParams; Body: Record<string, number> }>(
    '/:crewId/baseline',
    {
      schema: {
        params: crewParams,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: baselineProps,
        },
      },
    },
    async (req) =>
      updateBaseline(
        app.dbx,
        await resolveCrew(app.dbx, req.params.crewId),
        req.body,
      ),
  );

  // ---------------------------------------------------------------- raw vitals
  app.get<{ Params: CrewParams; Querystring: { limit: number } }>(
    '/:crewId/vitals',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          },
        },
      },
    },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      const { rows } = await app.withCrew(crew.id, (c) =>
        c.query(
          `SELECT ${VITAL_COLUMNS} FROM vitals ORDER BY recorded_at DESC, id DESC LIMIT $1`,
          [req.query.limit],
        ),
      );
      return rows;
    },
  );

  // Raw reading without model inference (kept for backwards compatibility; Pulse uses /telemetry).
  app.post<{ Params: CrewParams; Body: VitalsBody }>(
    '/:crewId/vitals',
    {
      schema: {
        params: crewParams,
        body: {
          type: 'object',
          required: ['heartRate', 'spo2'],
          additionalProperties: false,
          properties: {
            heartRate: { type: 'number', minimum: 20, maximum: 250 },
            spo2: { type: 'number', minimum: 0, maximum: 100 },
            eda: { type: 'number' },
            recordedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (req, reply) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      const { heartRate, spo2, eda, recordedAt } = req.body;
      const { rows } = await app.withCrew(crew.id, (c) =>
        c.query(
          `INSERT INTO vitals (crew_id, recorded_at, heart_rate, spo2, eda, inference_status)
           VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, $5, 'raw')
           RETURNING id, recorded_at, heart_rate, spo2, eda`,
          [
            crew.id,
            recordedAt ?? null,
            heartRate ?? null,
            spo2 ?? null,
            eda ?? null,
          ],
        ),
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // ---------------------------------------------------------------- telemetry + model inference
  app.post<{
    Params: CrewParams;
    Body: TelemetryInput;
    Querystring: { source?: ReadingSource };
  }>(
    '/:crewId/telemetry',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['pulse', 'cockpit', 'api'] },
          },
        },
        body: TELEMETRY_SCHEMA,
      },
    },
    async (req, reply) => {
      const { status, body } = await ingestTelemetry(
        app.dbx,
        req.params.crewId,
        req.body,
        req.query.source ?? 'api',
      );
      return reply.code(status).send(body);
    },
  );

  app.get<{ Params: CrewParams }>(
    '/:crewId/state',
    { schema: { params: crewParams } },
    async (req) =>
      crewState(app.dbx, await resolveCrew(app.dbx, req.params.crewId)),
  );

  app.get<{
    Params: CrewParams;
    Querystring: { metric: keyof typeof METRICS; window: keyof typeof WINDOWS };
  }>(
    '/:crewId/analytics',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              enum: Object.keys(METRICS),
              default: 'hr',
            },
            window: {
              type: 'string',
              enum: Object.keys(WINDOWS),
              default: '24h',
            },
          },
        },
      },
    },
    async (req) =>
      analytics(app.dbx, req.params.crewId, req.query.metric, req.query.window),
  );

  app.get<{
    Params: CrewParams;
    Querystring: { adherence?: number; horizon: number };
  }>(
    '/:crewId/twin',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            adherence: { type: 'number', minimum: 0, maximum: 100 },
            horizon: { type: 'integer', minimum: 1, maximum: 365, default: 60 },
          },
        },
      },
    },
    async (req) =>
      twin(app.dbx, req.params.crewId, req.query.adherence, req.query.horizon),
  );

  // ---------------------------------------------------------------- alerts & manual logs
  app.get<{
    Params: CrewParams;
    Querystring: { state: 'active' | 'all'; limit: number };
  }>(
    '/:crewId/alerts',
    {
      schema: {
        params: crewParams,
        querystring: {
          type: 'object',
          properties: {
            state: {
              type: 'string',
              enum: ['active', 'all'],
              default: 'active',
            },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (req) =>
      listAlerts(app.dbx, { ...req.query, crew: req.params.crewId }),
  );

  app.patch<{
    Params: CrewParams & { alertId: number };
    Body: { state: 'open' | 'acknowledged' | 'resolved' };
  }>(
    '/:crewId/alerts/:alertId',
    {
      schema: {
        params: {
          ...crewParams,
          required: ['crewId', 'alertId'],
          properties: {
            ...crewParams.properties,
            alertId: { type: 'integer' },
          },
        },
        body: {
          type: 'object',
          required: ['state'],
          additionalProperties: false,
          properties: {
            state: {
              type: 'string',
              enum: ['open', 'acknowledged', 'resolved'],
            },
          },
        },
      },
    },
    async (req) =>
      setAlertState(
        app.dbx,
        req.params.crewId,
        req.params.alertId,
        req.body.state,
      ),
  );

  app.post<{
    Params: CrewParams;
    Body: {
      kind: 'symptom' | 'device' | 'dermal_scan';
      label: string;
      detail?: string;
      event_id?: string;
    };
  }>(
    '/:crewId/logs',
    {
      schema: {
        params: crewParams,
        body: {
          type: 'object',
          required: ['kind', 'label'],
          additionalProperties: false,
          properties: {
            event_id: { type: 'string', minLength: 8, maxLength: 128 },
            kind: {
              type: 'string',
              enum: ['symptom', 'device', 'dermal_scan'],
            },
            label: { type: 'string', minLength: 1, maxLength: 120 },
            detail: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) =>
      reply
        .code(201)
        .send(
          await addLog(
            app.dbx,
            req.params.crewId,
            req.body.kind,
            req.body.label,
            req.body.detail,
            req.body.event_id,
          ),
        ),
  );

  // Suit swelling encoder (Digital_Twin_3D doc), calibrated on the LBNP HARESPOD feature set. The crew's personal HR /
  // SpO2 baselines feed its personal-delta features unless the caller overrides them.
  app.post<{ Params: CrewParams; Body: Record<string, number> }>(
    '/:crewId/suit/evaluate',
    {
      schema: {
        params: crewParams,
        body: { type: 'object', additionalProperties: { type: 'number' } },
      },
    },
    async (req) => {
      const crew = await resolveCrew(app.dbx, req.params.crewId);
      const baseline = await app.dbx.withCrew(crew.id, (c) =>
        getBaseline(c, crew),
      );
      return ml.suit({
        base_hr: baseline.hr_bpm,
        base_spo2: baseline.spo2_pct,
        ...req.body,
        crew_id: crew.slug,
      });
    },
  );
};

export default crewRoutes;
