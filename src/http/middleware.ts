import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { errorBody } from './errors.js';
import type { Logger } from './logger.js';

/** Fixed-window limiter per client IP (in memory: enough for a single internal service). */
export function rateLimit(max: number, windowMs: number, now: () => number = Date.now): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    if (req.path === '/health') return next();
    const t = now();
    const key = req.ip ?? 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
      // opportunistic cleanup keeps the map from growing forever
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
    }
    entry.count++;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
      res.status(429).json(errorBody('RATE_LIMITED', 'Demasiadas solicitudes, intenta de nuevo en un momento'));
      return;
    }
    next();
  };
}

/** Optional shared secret between the API and this service. */
export function requireApiKey(key: string | undefined): RequestHandler {
  if (!key) return (_req, _res, next) => next();
  const expected = Buffer.from(key);
  return (req, res, next) => {
    if (req.path === '/health') return next();
    const given = Buffer.from(String(req.header('x-api-key') ?? ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.status(401).json(errorBody('UNAUTHORIZED', 'Falta una clave de servicio válida'));
      return;
    }
    next();
  };
}

/** One structured log line per request (no bodies). */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
      });
    });
    next();
  };
}
