import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
export interface Identity {
  name: string;
  role: 'operator' | 'crew';
  crew?: string;
}
export const identity = new AsyncLocalStorage<Identity>();
const sessions = new Map<string, { user: Identity; expires: number }>();
const attempts = new Map<string, { n: number; until: number }>();
const crews = ['okafor', 'brandt', 'sato', 'diaz'];
const demo = process.env.DEMO_MODE === 'true';
const configured = process.env.AUTH_USERS
  ? (JSON.parse(process.env.AUTH_USERS) as Record<
      string,
      { password: string; role: 'operator' | 'crew'; crew?: string }
    >)
  : null;
const salt = randomBytes(16);
const accounts = Object.fromEntries(
  Object.entries(
    configured ??
      (demo
        ? {
            operator: {
              password: 'avia-demo-operator',
              role: 'operator' as const,
            },
            ...Object.fromEntries(
              crews.map((crew) => [
                crew,
                { password: 'avia-demo-crew', role: 'crew' as const, crew },
              ]),
            ),
          }
        : {}),
  ).map(([name, a]) => [
    name,
    { ...a, hash: scryptSync(a.password, salt, 32) },
  ]),
);
function cookie(req: { headers: Record<string, unknown> }) {
  return String(req.headers.cookie ?? '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('avia_session='))
    ?.slice(13);
}
export function currentUser(req: { headers: Record<string, unknown> }) {
  const token = cookie(req),
    session = token ? sessions.get(token) : undefined;
  if (!session || session.expires < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session.user;
}
export async function registerSecurity(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          new URL(origin);
        } catch {
          return reply.code(403).send({ error: 'Invalid origin' });
        }
      }
      if (
        origin &&
        new URL(origin).host !== req.headers.host &&
        !String(
          process.env.ALLOWED_ORIGINS ??
            'http://localhost:5173,http://localhost:5174,http://localhost:8080,http://localhost:8081',
        )
          .split(',')
          .includes(origin)
      )
        return reply.code(403).send({ error: 'Untrusted request origin' });
    }
    const path = req.url.split('?')[0];
    if (path === '/health' || path === '/live' || path.startsWith('/auth/'))
      return;
    const user = currentUser(req);
    if (!user) return reply.code(401).send({ error: 'Sign in required' });
    const match = path.match(/\/crew\/([^/]+)/);
    if (user.role === 'crew') {
      if (match && decodeURIComponent(match[1]) !== user.crew)
        return reply.code(403).send({ error: 'This crew record is private' });
      if (
        path === '/cockpit/crew' ||
        path === '/cockpit/alerts' ||
        path === '/activity' ||
        (path.includes('/mission') && req.method !== 'GET') ||
        ((path.endsWith('/baseline') || path.endsWith('/configuration')) &&
          req.method !== 'GET') ||
        (path.includes('/countermeasures') && req.method === 'POST')
      )
        return reply.code(403).send({ error: 'Operator permission required' });
      if (path === '/api/v1/suit/evaluate')
        return reply
          .code(403)
          .send({ error: 'Operator scenario permission required' });
    }
  });
  app.addHook('preHandler', (req, reply, done) => {
    const user = currentUser(req);
    if (
      user?.role === 'crew' &&
      req.url.split('?')[0] === '/api/v1/pulse/ingest' &&
      (req.body as any)?.crew_id !== user.crew
    ) {
      reply.code(403).send({ error: 'Crew identity mismatch' });
      done();
      return;
    }
    identity.run(user ?? { name: 'anonymous', role: 'operator' }, done);
  });
  app.post<{ Body: { username: string; password: string } }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', maxLength: 80 },
            password: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const id = req.ip,
        limit = attempts.get(id);
      if (limit && limit.until > Date.now() && limit.n >= 15)
        return reply
          .code(429)
          .send({ error: 'Too many attempts. Try again in one minute.' });
      const account = Object.hasOwn(accounts, req.body.username)
        ? accounts[req.body.username]
        : undefined;
      const hash = scryptSync(req.body.password, salt, 32);
      if (!account || !timingSafeEqual(hash, account.hash)) {
        attempts.set(id, {
          n: (limit?.until && limit.until > Date.now() ? limit.n : 0) + 1,
          until: Date.now() + 60000,
        });
        return reply.code(401).send({ error: 'Invalid credentials' });
      }
      attempts.delete(id);
      const token = randomBytes(32).toString('hex');
      const user: Identity = {
        name: req.body.username,
        role: account.role,
        crew: account.crew,
      };
      sessions.set(token, { user, expires: Date.now() + 8 * 3600000 });
      reply.header(
        'set-cookie',
        `avia_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`,
      );
      return user;
    },
  );
  app.get('/auth/session', async (req, reply) => {
    const user = currentUser(req);
    return user ?? reply.code(401).send({ error: 'Sign in required', demo });
  });
  app.post('/auth/logout', async (req, reply) => {
    const token = cookie(req);
    if (token) sessions.delete(token);
    reply.header(
      'set-cookie',
      'avia_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    );
    return { ok: true };
  });
  const timer = setInterval(() => {
    for (const [k, s] of sessions)
      if (s.expires < Date.now()) sessions.delete(k);
    for (const [k, a] of attempts) if (a.until < Date.now()) attempts.delete(k);
  }, 60000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
