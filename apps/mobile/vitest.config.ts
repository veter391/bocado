import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @bocado/mobile.
 *
 * NODE environment — these are PURE unit tests for the data layer and the API
 * client. They must never import a React Native component/screen or hit the
 * network (the client's `fetch` is mocked at the global boundary in the tests).
 *
 * Aliases mirror tsconfig `paths` so the workspace packages resolve to their TS
 * source (no build step) and `@/...` resolves to `src/...`:
 *   - `@`               -> src
 *   - `@bocado/shared`  -> packages/shared/src
 *   - `@bocado/nutrition` -> packages/nutrition/src
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
