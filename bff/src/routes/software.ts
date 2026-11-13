import type { FastifyPluginAsync } from 'fastify';
import { request } from '../clients/api.js';
import { identity } from '../security.js';
const routes: FastifyPluginAsync = async (app) => {
  app.put<{ Params: { crewId: string }; Body: unknown }>(
    '/crew/:crewId/configuration',
    async (req) => {
      const result = await request(
        '/crew/' + encodeURIComponent(req.params.crewId) + '/configuration',
        { method: 'PUT', body: JSON.stringify(req.body) },
      );
      await app.invalidateCockpit();
      return result;
    },
  );
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/task-history',
    async (req) =>
      request(
        '/crew/' + encodeURIComponent(req.params.crewId) + '/task-history',
      ),
  );
  app.get('/activity', async (req, reply) =>
    identity.getStore()?.role === 'operator'
      ? request('/activity')
      : reply.code(403).send({ error: 'Operator permission required' }),
  );
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/tasks',
    async (req) => {
      const all = await request<any[]>('/countermeasures');
      return all.filter((t) => t.crew_id === req.params.crewId);
    },
  );
  app.patch<{
    Params: { crewId: string; id: string };
    Body: { done: boolean };
  }>(
    '/crew/:crewId/tasks/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['done'],
          additionalProperties: false,
          properties: { done: { type: 'boolean' } },
        },
      },
    },
    async (req) =>
      request(`/countermeasures/${encodeURIComponent(req.params.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(req.body),
      }),
  );
  app.get<{ Params: { crewId: string } }>(
    '/crew/:crewId/journal',
    async (req) =>
      request(`/crew/${encodeURIComponent(req.params.crewId)}/journal`),
  );
  app.post<{
    Params: { crewId: string };
    Body: { text: string; consent: boolean };
  }>('/crew/:crewId/journal', async (req, reply) =>
    reply
      .code(201)
      .send(
        await request(
          `/crew/${encodeURIComponent(req.params.crewId)}/journal`,
          { method: 'POST', body: JSON.stringify(req.body) },
        ),
      ),
  );
  for (const method of ['PATCH', 'DELETE'] as const)
    app.route<{
      Params: { crewId: string; id: string };
      Body: { consent: boolean };
    }>({
      method,
      url: '/crew/:crewId/journal/:id',
      handler: async (req, reply) => {
        const data = await request(
          `/crew/${encodeURIComponent(req.params.crewId)}/journal/${encodeURIComponent(req.params.id)}`,
          {
            method,
            body: method === 'PATCH' ? JSON.stringify(req.body) : undefined,
          },
        );
        if (method === 'DELETE') return reply.code(204).send();
        return data;
      },
    });
};
export default routes;
