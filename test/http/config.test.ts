import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createLogger } from '../../src/http/logger.js';

describe('loadConfig', () => {
  it('applies defaults, including the Claude model and port 5000', () => {
    const c = loadConfig({});
    expect(c.PORT).toBe(5000);
    expect(c.ANTHROPIC_MODEL).toBe('claude-sonnet-5-5');
    expect(c.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('treats empty strings as unset (as in a copied .env.example)', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: '', INTERNAL_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('fails fast on invalid values', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ INTERNAL_API_KEY: 'short' })).toThrow(/INTERNAL_API_KEY/);
  });
});

describe('createLogger', () => {
  it('writes one JSON line per event and honors the level', () => {
    const lines: string[] = [];
    const log = createLogger('warn', (l) => lines.push(l));
    log.info('hidden');
    log.warn('shown', { reason: 'x' });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toMatchObject({ level: 'warn', msg: 'shown', reason: 'x', service: 'episafe-ia' });
  });
});
