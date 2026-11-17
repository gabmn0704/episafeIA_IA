import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  /** comma-separated list of allowed origins; "*" allows any (dev only) */
  CORS_ORIGINS: z.string().default('http://localhost:4000,http://localhost:5173'),
  /** when set, every request except /health must send it in `x-api-key` */
  INTERNAL_API_KEY: z.string().min(16).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export type Config = z.infer<typeof envSchema>;

/** Parses and validates the environment; empty strings count as unset. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}
