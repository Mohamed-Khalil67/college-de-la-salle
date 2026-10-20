import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Unit tests for the framework-free helpers (*.spec.ts next to the code). */
export default defineConfig({
  resolve: {
    alias: { '@cdls/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: { include: ['src/**/*.spec.ts'], environment: 'node' },
});
