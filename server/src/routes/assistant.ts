import type { FastifyPluginAsync } from "fastify";
import { createHash } from "node:crypto";
import { HttpError } from "../errors.js";
import { resolveCrew } from "../services/crew.js";
import {
  AGENTS,
  MODES,
  assistantContext,
  checkObservation,
  consentFor,
  observationSchema,
  runAssistant,
  type Actor,
  type AssistantInput,
} from "../services/assistant.js";
import {
  KNOWLEDGE_VERSION,
  sources,
  protocols,
} from "../services/knowledge.js";
import { museConfigured } from "../services/muse.js";
import { seal, unseal } from "../services/privacy.js";
import { ingestTelemetry, TELEMETRY_SCHEMA } from "../services/telemetry.js";

const params = {
  type: "object",
  required: ["crewId"],
  properties: { crewId: { type: "string", pattern: "^[a-z0-9-]{2,64}$" } },
};
const idParams = {
  ...params,
  required: ["crewId", "id"],
  properties: { ...params.properties, id: { type: "string", format: "uuid" } },
};
const assistant: FastifyPluginAsync = async (app) => {
  async function authorized(req: any) {
    const crew = await resolveCrew(app.dbx, req.params.crewId);
    const actor: Actor = {
      name: String(req.headers["x-actor"] ?? ""),
      role: String(req.headers["x-role"] ?? ""),
      crew: String(req.headers["x-crew"] ?? ""),
    };
    if (
      !actor.name ||
      !["operator", "crew"].includes(actor.role) ||
      (actor.role === "crew" && actor.crew !== crew.slug)
    )
      throw new HttpError(403, "Crew permission required");
    return { crew, actor };
  }
  app.get<{ Params: { crewId: string } }>(
    "/crew/:crewId/assistant",
    { schema: { params } },
    async (req) => {
      const { crew, actor } = await authorized(req);
      const [consent, context, runs] = await Promise.all([
        consentFor(app.dbx, crew, actor),
        assistantContext(app.dbx, crew, actor),
        app.withCrew(
          crew.id,
          async (c) =>
            (
              await c.query(
                "SELECT id,status,created_at FROM assistant_runs WHERE actor=$1 ORDER BY created_at DESC LIMIT 20",
                [actor.name],
              )
            ).rows,
        ),
      ]);
      return {
        agents: AGENTS,
        cloud_configured: museConfigured(),
        model: museConfigured() ? process.env.META_MODEL : null,
        consent,
        context,
        runs,
        sources,
        knowledge_version: KNOWLEDGE_VERSION,
        protocols,
        clinical_review: "not_established",
      };
    },
  );
  app.put<{
    Params: { crewId: string };
    Body: { cloud: boolean; journal: boolean };
  }>(
    "/crew/:crewId/assistant/consent",
    {
      schema: {
        params,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["cloud", "journal"],
          properties: {
            cloud: { type: "boolean" },
            journal: { type: "boolean" },
          },
        },
      },
    },
    async (req) => {
      const { crew, actor } = await authorized(req);
      if (req.body.journal && (actor.role !== "crew" || !req.body.cloud))
        throw new HttpError(
          403,
          "Journal processing requires owner cloud consent",
        );
      return app.withCrew(
        crew.id,
        async (c) =>
          (
            await c.query(
              "INSERT INTO assistant_consents(crew_id,actor,cloud,journal) VALUES($1,$2,$3,$4) ON CONFLICT(crew_id,actor) DO UPDATE SET cloud=$3,journal=$4,updated_at=now() RETURNING cloud,journal,updated_at",
              [crew.id, actor.name, req.body.cloud, req.body.journal],
            )
          ).rows[0],
      );
    },
  );
  app.post<{ Params: { crewId: string }; Body: AssistantInput }>(
    "/crew/:crewId/assistant/run",
    {
      schema: {
        params,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["request_id", "message", "mode", "use_cloud"],
          properties: {
            request_id: { type: "string", format: "uuid" },
            message: { type: "string", minLength: 1, maxLength: 4000 },
            mode: { type: "string", enum: MODES },
            use_cloud: { type: "boolean" },
            journal_id: { type: "string", format: "uuid" },
            previous_id: { type: "string", format: "uuid" },
            observation: observationSchema,
            telemetry: { ...TELEMETRY_SCHEMA, additionalProperties: false },
            scenario: {
              type: "object",
              additionalProperties: false,
              required: ["adherence_pct", "horizon_days"],
              properties: {
                adherence_pct: { type: "number", minimum: 0, maximum: 100 },
                horizon_days: { type: "integer", minimum: 1, maximum: 365 },
                suit_preset: { type: "string", enum: ["nominal", "left_arm"] },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const { crew, actor } = await authorized(req);
      return runAssistant(app.dbx, crew, actor, req.body);
    },
  );
  app.get<{ Params: { crewId: string; id: string } }>(
    "/crew/:crewId/assistant/runs/:id",
    { schema: { params: idParams } },
    async (req) => {
      const { crew, actor } = await authorized(req);
      return app.withCrew(crew.id, async (c) => {
        const row = (
          await c.query(
            "SELECT ciphertext,status,confirmed_actions FROM assistant_runs WHERE id=$1 AND actor=$2",
            [req.params.id, actor.name],
          )
        ).rows[0];
        if (!row) throw new HttpError(404, "Assessment not found");
        if (!row.ciphertext) return { status: row.status };
        const data = unseal(row.ciphertext);
        for (const p of data.proposals)
          if (row.confirmed_actions[p.id])
            p.result = row.confirmed_actions[p.id];
        return data;
      });
    },
  );
  app.delete<{ Params: { crewId: string; id: string } }>(
    "/crew/:crewId/assistant/runs/:id",
    { schema: { params: idParams } },
    async (req, reply) => {
      const { crew, actor } = await authorized(req);
      await app.withCrew(crew.id, async (c) => {
        const r = await c.query(
          "DELETE FROM assistant_runs WHERE id=$1 AND actor=$2 RETURNING id",
          [req.params.id, actor.name],
        );
        if (!r.rowCount) throw new HttpError(404, "Assessment not found");
      });
      return reply.code(204).send();
    },
  );
  app.post<{
    Params: { crewId: string; id: string };
    Body: { action_id: string; confirm: boolean };
  }>(
    "/crew/:crewId/assistant/runs/:id/confirm",
    {
      schema: {
        params: idParams,
        body: {
          type: "object",
          additionalProperties: false,
          required: ["action_id", "confirm"],
          properties: {
            action_id: { type: "string", format: "uuid" },
            confirm: { type: "boolean", const: true },
          },
        },
      },
    },
    async (req) => {
      const { crew, actor } = await authorized(req);
      return app.withCrew(crew.id, async (c) => {
        const row = (
          await c.query(
            "SELECT * FROM assistant_runs WHERE id=$1 AND actor=$2 FOR UPDATE",
            [req.params.id, actor.name],
          )
        ).rows[0];
        if (!row?.ciphertext) throw new HttpError(404, "Assessment not found");
        if (row.confirmed_actions[req.body.action_id])
          return {
            ...row.confirmed_actions[req.body.action_id],
            duplicate: true,
          };
        if (new Date(row.expires_at).getTime() < Date.now())
          throw new HttpError(
            409,
            "Proposal expired; request a fresh assessment",
          );
        const p = unseal(row.ciphertext).proposals.find(
          (x: any) => x.id === req.body.action_id,
        );
        if (!p) throw new HttpError(404, "Proposal not found");
        let result: any;
        if (p.type === "task") {
          const protocol = protocols[p.protocol as keyof typeof protocols];
          if (!protocol || p.label !== protocol.label)
            throw new HttpError(422, "Unapproved task");
          result = (
            await c.query(
              "INSERT INTO countermeasures(label,crew_id,source,scheduled_for) VALUES($1,$2,'manual',$3) ON CONFLICT(scheduled_for,label,crew_id) DO UPDATE SET updated_at=now() RETURNING id,label,scheduled_for",
              [p.label, crew.id, p.scheduled_for],
            )
          ).rows[0];
        } else if (p.type === "observation") {
          checkObservation(p.observation);
          result = (
            await c.query(
              "INSERT INTO health_observations(id,crew_id,actor,kind,ciphertext,recorded_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,kind,recorded_at",
              [
                p.id,
                crew.id,
                actor.name,
                p.observation.kind,
                seal(p.observation),
                p.observation.recorded_at,
              ],
            )
          ).rows[0];
        } else if (p.type === "telemetry") {
          // The event ID makes a retry safe even if the outer confirmation transaction is interrupted.
          const reading = await ingestTelemetry(
            app.dbx,
            crew.slug,
            { ...p.telemetry, event_id: p.id, input_origin: "manual" },
            "api",
            { returnState: false },
          );
          result = { ...reading.body, accepted_status: reading.status };
        } else throw new HttpError(422, "Unsupported action");
        const saved = {
          confirmed: true,
          type: p.type,
          actor: actor.name,
          confirmed_at: new Date().toISOString(),
          ...result,
        };
        await c.query(
          "UPDATE assistant_runs SET confirmed_actions=confirmed_actions||jsonb_build_object($2::text,$3::jsonb),updated_at=now() WHERE id=$1",
          [req.params.id, p.id, JSON.stringify(saved)],
        );
        return saved;
      });
    },
  );
  app.delete<{ Params: { crewId: string; id: string } }>(
    "/crew/:crewId/assistant/observations/:id",
    { schema: { params: idParams } },
    async (req, reply) => {
      const { crew, actor } = await authorized(req);
      await app.withCrew(crew.id, async (c) => {
        const r = await c.query(
          "DELETE FROM health_observations WHERE id=$1 AND actor=$2 RETURNING id",
          [req.params.id, actor.name],
        );
        if (!r.rowCount) throw new HttpError(404, "Observation not found");
      });
      return reply.code(204).send();
    },
  );
};
export default assistant;
