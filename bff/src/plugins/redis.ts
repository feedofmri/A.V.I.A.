import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    /** Return the cached JSON value for `key`, or compute, cache (for `ttlSeconds`) and return it. */
    cached<T>(
      key: string,
      ttlSeconds: number,
      load: () => Promise<T>,
    ): Promise<T>;
    /** Drop every cached Cockpit view (called after any write). */
    invalidateCockpit(): Promise<void>;
  }
}

export default fp<{ url: string }>(async (app, opts) => {
  const redis = new Redis(opts.url, { maxRetriesPerRequest: 2 });
  redis.on('error', (err) => app.log.warn({ err }, 'redis error'));

  app.decorate('redis', redis);
  app.decorate('cached', async (key, ttlSeconds, load) => {
    // Cache is best-effort: if Redis is down, fall through to the loader.
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit);
    } catch (err) {
      app.log.warn({ err, key }, 'cache read failed');
    }
    const generation = await redis
      .get('avia:cache-generation')
      .catch(() => null);
    const value = await load();
    const current = await redis.get('avia:cache-generation').catch(() => null);
    if (current === generation)
      redis.set(key, JSON.stringify(value), 'EX', ttlSeconds).catch((err) => {
        app.log.warn({ err, key }, 'cache write failed');
      });
    return value;
  });
  app.decorate('invalidateCockpit', async () => {
    try {
      await redis.incr('avia:cache-generation');
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(
          cursor,
          'MATCH',
          'cockpit:*',
          'COUNT',
          200,
        );
        if (keys.length) await redis.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (err) {
      app.log.warn({ err }, 'cache invalidation failed');
    }
  });

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
