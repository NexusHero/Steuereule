import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// Live tier (ADR-0066): the owl against the REAL model and a real Postgres. Costs money and is not
// deterministic, so it never runs with `pnpm test` or the integration tier — only nightly
// (.github/workflows/ai-eval-nightly.yml) or by hand:
//
//   DATABASE_URL=… AI_EVAL_GEMINI_API_KEY=… pnpm --filter @steuereule/api test:live
//
// Without the key every scenario is skipped.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/live/**/*.live.test.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    // One scenario is a few model rounds; a slow provider must not look like a wrong answer.
    testTimeout: 180_000,
    // The model is not deterministic: a scenario counts as broken when it fails twice in a row.
    retry: 1,
    env: {
      GUEST_SESSION_SECRET: 'live-test-secret',
      // The documented synthetic dev key (ADR-0008), the one the secret scan knows as harmless.
      PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      BETTER_AUTH_SECRET: 'live-test-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
})
