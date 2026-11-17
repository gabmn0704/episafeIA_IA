import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import type { TextModel } from '../../src/explain/anthropic.js';
import { createLogger } from '../../src/http/logger.js';
import { generateSynthetic } from '../helpers/synthetic.js';

const make = (env: Record<string, string> = {}, model?: TextModel | null) =>
  createApp({ config: loadConfig({ NODE_ENV: 'test', ...env }), logger: createLogger('silent'), model: model ?? null });

describe('GET /health', () => {
  it('reports status and explain mode without auth', async () => {
    const res = await request(make({ INTERNAL_API_KEY: 'k'.repeat(20) })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'episafe-ia', explain: 'template' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('POST /analyze/patterns', () => {
  it('returns the sleep insight for synthetic data (camelCase and snake_case)', async () => {
    const data = generateSynthetic({ days: 180, seed: 42 });
    const res = await request(make()).post('/analyze/patterns').send(data);
    expect(res.status).toBe(200);
    expect(res.body.insights[0]).toMatchObject({ kind: 'trigger_pattern' });
    expect(res.body.insights[0].evidence.factor).toBe('short_sleep');

    const snake = {
      seizures: data.seizures.map((s) => ({ started_at: s.startedAt, severity: s.severity })),
      dailyLogs: data.dailyLogs.map((l) => ({ log_date: l.logDate, sleep_hours: String(l.sleepHours), stress_level: l.stressLevel })),
    };
    const res2 = await request(make()).post('/analyze/patterns').send(snake);
    expect(res2.status).toBe(200);
    expect(res2.body.insights[0].evidence.factor).toBe('short_sleep');
  });

  it('answers with an explanatory insight on empty input', async () => {
    const res = await request(make()).post('/analyze/patterns').send({});
    expect(res.status).toBe(200);
    expect(res.body.insights[0].kind).toBe('insufficient_data');
  });

  it('rejects malformed payloads with the uniform error shape', async () => {
    const res = await request(make()).post('/analyze/patterns').send({ seizures: [{ startedAt: 'nope' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });
});

describe('POST /risk/score and /risk/train', () => {
  it('scores a day with explanation', async () => {
    const res = await request(make())
      .post('/risk/score')
      .send({ today: { sleepHours: 3.5, stressLevel: 9, caffeineMg: 500, exerciseMinutes: 0, missedMeds: 2 } });
    expect(res.status).toBe(200);
    expect(res.body.score).toBeGreaterThan(50);
    expect(['high', 'critical']).toContain(res.body.level);
    expect(res.body.factors[0]).toHaveProperty('direction');
    expect(res.body.modelVersion).toBe('logit-prior-1.0');
  });

  it('requires "today"', async () => {
    const res = await request(make()).post('/risk/score').send({});
    expect(res.status).toBe(400);
  });

  it('trains and returns reusable weights', async () => {
    const days = Array.from({ length: 80 }, (_, i) => ({
      sleepHours: i % 4 === 0 ? 4 : 8,
      stressLevel: 3,
      seizure: i % 4 === 0 && i % 8 === 0,
    }));
    const res = await request(make()).post('/risk/train').send({ history: { days } });
    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(true);
    expect(res.body.weights).toHaveLength(9);
    const again = await request(make()).post('/risk/score').send({ today: { sleepHours: 4 }, weights: res.body.weights });
    expect(again.status).toBe(200);
  });
});

describe('POST /wearable/evaluate', () => {
  it('detects sustained tachycardia', async () => {
    const T0 = Date.parse('2025-06-01T10:00:00Z');
    const window = Array.from({ length: 120 }, (_, t) => ({
      sampledAt: new Date(T0 + t * 1000).toISOString(),
      heartRate: 140,
    }));
    const res = await request(make()).post('/wearable/evaluate').send({ window });
    expect(res.status).toBe(200);
    expect(res.body.anomalies[0].kind).toBe('tachycardia');
  });
});

describe('POST /explain', () => {
  const body = { type: 'risk', risk: { score: 70, level: 'high', factors: [] } };

  it('uses templates without a key and always includes the neurologist disclaimer', async () => {
    const res = await request(make()).post('/explain').send(body);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('template');
    expect(res.body.text).toMatch(/neurólogo/);
  });

  it('uses the injected model when available and never calls the network', async () => {
    const model: TextModel = { name: 'fake', complete: vi.fn(async () => 'Tu día tiene un riesgo alto.') };
    const res = await request(make({}, model)).post('/explain').send(body);
    expect(res.body.source).toBe('claude');
    expect(res.body.model).toBe('fake');
    expect(model.complete).toHaveBeenCalledOnce();
  });

  it('rejects unknown types', async () => {
    const res = await request(make()).post('/explain').send({ type: 'diagnosis' });
    expect(res.status).toBe(400);
  });
});

describe('cross-cutting behavior', () => {
  it('requires the service key when configured', async () => {
    const key = 'secret-key-0123456789';
    const app = make({ INTERNAL_API_KEY: key });
    expect((await request(app).post('/risk/score').send({ today: {} })).status).toBe(401);
    expect((await request(app).post('/risk/score').set('x-api-key', 'wrong-wrong-wrong-1').send({ today: {} })).status).toBe(401);
    expect((await request(app).post('/risk/score').set('x-api-key', key).send({ today: {} })).status).toBe(200);
  });

  it('rate limits after the configured number of requests', async () => {
    const app = make({ RATE_LIMIT_MAX: '3' });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await request(app).post('/risk/score').send({ today: {} })).status);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('returns uniform 404 and invalid JSON errors', async () => {
    const app = make();
    const nf = await request(app).get('/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
    const bad = await request(app).post('/risk/score').set('content-type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
  });

  it('applies CORS only to configured origins', async () => {
    const app = make({ CORS_ORIGINS: 'http://localhost:4000' });
    const ok = await request(app).get('/health').set('Origin', 'http://localhost:4000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:4000');
    const other = await request(app).get('/health').set('Origin', 'http://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});
