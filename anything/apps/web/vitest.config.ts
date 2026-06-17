import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './test/setupTests.ts',
    include: [
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
      '../../shared/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Mirror the build alias (vite.config.ts) so modules importing the auth
      // shim (e.g. utils/useUser.js) are resolvable under Vitest. Tests still
      // vi.mock it, so the real @hono code never runs.
      '@auth/create/react': '@hono/auth-js/react',
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  cacheDir: './.vitest',
});
