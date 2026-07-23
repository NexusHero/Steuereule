import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// DB-gated cascade (ADR-0004): real Postgres via Prisma, run behind `pnpm
// test:integration` in the compose/testcontainers stage — never part of the plain
// `pnpm -r test` CI job, so CI doesn't go red without a live database. Requires a
// real DATABASE_URL pointing at a migrated Postgres. See vitest.config.ts for why the
// SWC plugin is required (decorator metadata Nest depends on).
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.integration.test.ts'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      GUEST_SESSION_SECRET: 'integration-test-secret',
      // Fixed synthetic key (ADR-0008) — generated for this test suite only, never a
      // real secret, never reused outside this config.
      PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.88HQ6liBiB7TuT9O1FcbkSPqheUyhJj9cPwirUr8njs=',
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
})
