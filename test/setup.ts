// Guard: tests must never reach external APIs (Anthropic included).
import { vi } from 'vitest';

vi.stubGlobal('fetch', () => {
  throw new Error('Network access is disabled in tests: inject a fake TextModel instead.');
});
