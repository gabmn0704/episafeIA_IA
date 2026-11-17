import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import { analyzePatternsSchema } from './domain/schemas.js';
import { createAnthropicModel, type TextModel } from './explain/anthropic.js';
import { explainSchema } from './explain/schemas.js';
import { explain } from './explain/service.js';
import { errorHandler, notFound } from './http/errors.js';
import type { Logger } from './http/logger.js';
import { rateLimit, requestLogger, requireApiKey } from './http/middleware.js';
import { analyzePatterns } from './patterns/engine.js';
import { riskScoreSchema, scoreRisk, trainSchema } from './risk/score.js';
import { trainFromHistory } from './risk/train.js';
import { VERSION } from './version.js';
import { evaluateWearable } from './wearable/evaluate.js';
import { wearableEvaluateSchema } from './wearable/schemas.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  /** inject a model in tests; by default built from ANTHROPIC_API_KEY when present */
  model?: TextModel | null;
}

/** Wraps a handler so that parse errors and sync throws reach the error middleware. */
const route =
  (fn: (body: unknown) => unknown | Promise<unknown>): RequestHandler =>
  async (req, res, next) => {
    try {
      res.json(await fn(req.body ?? {}));
    } catch (err) {
      next(err);
    }
  };

export function createApp({ config, logger, model }: AppDeps): Express {
  const textModel =
    model === undefined ? (config.ANTHROPIC_API_KEY ? createAnthropicModel(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL) : null) : model;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  const origins = config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins.includes('*') ? true : origins, methods: ['GET', 'POST'] }));
  app.use(requestLogger(logger));
  app.use(rateLimit(config.RATE_LIMIT_MAX, config.RATE_LIMIT_WINDOW_MS));
  app.use(requireApiKey(config.INTERNAL_API_KEY));
  app.use(express.json({ limit: '4mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'episafe-ia', version: VERSION, explain: textModel ? 'claude' : 'template' });
  });

  app.post('/analyze/patterns', route((body) => analyzePatterns(analyzePatternsSchema.parse(body))));
  app.post('/risk/score', route((body) => scoreRisk(riskScoreSchema.parse(body))));
  app.post('/risk/train', route((body) => trainFromHistory(trainSchema.parse(body).history)));
  app.post('/wearable/evaluate', route((body) => evaluateWearable(wearableEvaluateSchema.parse(body))));
  app.post(
    '/explain',
    route((body) =>
      explain(explainSchema.parse(body), {
        model: textModel ?? undefined,
        onFallback: (reason) => logger.warn('explain fell back to template', { reason }),
      }),
    ),
  );

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
