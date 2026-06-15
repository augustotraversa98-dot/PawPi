import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SEPARATE project from the fast mocked unit suite (vitest.config.ts). This one
// runs the real-Postgres integration tests (RLS R0 / Phase C) against a
// throwaway embedded Postgres booted in test/integration/globalSetup.ts.
//
// `npm test` (the unit suite) stays the required PR gate and never starts a DB.
// `npm run test:integration` runs this. The two never overlap: the unit config
// only globs src/** + ../../shared/**, while these tests live under test/.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/integration/**/*.integration.test.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    // One shared DB with TRUNCATE-based isolation between tests, so run files
    // sequentially in a single process — no cross-file races on the data.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // First run may extract the Postgres binary; give boot + migrations room.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  cacheDir: './.vitest-integration',
});
