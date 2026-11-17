import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'] },
  },
});
