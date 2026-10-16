import { defineConfig } from 'vitest/config';

// Security-rules suite: runs against the Firestore emulator (see `npm run test:rules`).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});