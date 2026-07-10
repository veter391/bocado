import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @bocado/api.
 *
 * Resolves the workspace packages to their TS source (matching tsconfig `paths`)
 * so unit tests run against the real engine without a build step. Tests never hit
 * the network: the perception client is mocked at the module boundary (see
 * src/routes/scan.test.ts).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@bocado/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@bocado/nutrition': fileURLToPath(
        new URL('../../packages/nutrition/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
