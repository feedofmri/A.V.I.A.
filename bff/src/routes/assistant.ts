import type { FastifyPluginAsync } from "fastify";
import { request } from "../clients/api.js";
const routes: FastifyPluginAsync = async (app) => {
  for (const [method, suffix] of [
    ["GET", ""],
    ["PUT", "/consent"],
    ["POST", "/run"],
    ["GET", "/runs/:id"],
    ["DELETE", "/runs/:id"],
    ["POST", "/runs/:id/confirm"],
    ["DELETE", "/observations/:id"],
  ] as const) {
    app.route<{ Params: { crewId: string; id?: string }; Body: unknown }>({
      method,
      url: "/crew/:crewId/assistant" + suffix,
      handler: async (req, reply) => {
        const path =
          "/crew/" +
          encodeURIComponent(req.params.crewId) +
          "/assistant" +
          suffix.replace(":id", encodeURIComponent(req.params.id ?? ""));
        const result = await request(path, {
          method,
          ...(["POST", "PUT"].includes(method)
            ? { body: JSON.stringify(req.body) }
            : {}),
        });
        if (method === "DELETE") return reply.code(204).send();
        if (method === "POST") await app.invalidateCockpit();
        return result;
      },
    });
  }
};
export default routes;
