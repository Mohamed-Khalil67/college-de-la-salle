import { defineConfig } from 'vitest/config';

/** Security-rules suite. Requires the Firestore emulator — run via `npm run test:rules`. */
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
