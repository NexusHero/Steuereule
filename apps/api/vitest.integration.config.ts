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
    // test/acceptance/**: the REQ-005/006/009/010 ATDD suites (ADR-0012) — same
    // DB-gated tier as the *.integration.test.ts files, named after their Register
    // requirement id rather than the file-suffix convention so they read as the
    // acceptance criterion they prove, not an implementation-detail test.
    include: ['test/**/*.integration.test.ts', 'test/acceptance/**/*.test.ts'],
    // Every file in this tier shares one real Postgres instance (no per-file
    // database/schema isolation) and several acceptance suites do blanket
    // `deleteMany()` cleanup (session/account/user/rateLimit) in their own
    // `afterEach` — safe within a file, but Vitest's default parallel-file
    // execution would let one file's cleanup race and wipe another file's
    // still-in-flight session/account rows. Sequential file execution removes that
    // cross-file interference entirely; still fully parallel *within* a file.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      GUEST_SESSION_SECRET: 'integration-test-secret',
      // Fixed synthetic key (ADR-0008) — generated for this test suite only, never a
      // real secret, never reused outside this config.
      PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.88HQ6liBiB7TuT9O1FcbkSPqheUyhJj9cPwirUr8njs=',
      // Synthetic, generated for this test suite only (ADR-0012) — never a real secret.
      BETTER_AUTH_SECRET: 'integration-test-better-auth-secret-0123456789',
      BETTER_AUTH_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
})
