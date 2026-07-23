import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// No-DB unit test job (ADR-0004): pure logic + fake-repository HTTP tests + the
// OpenAPI contract test. DB-requiring tests live in vitest.integration.config.ts
// behind the separate `test:integration` script so this job never goes red without
// a live Postgres.
//
// NestJS's DI resolution, ValidationPipe DTO detection and @nestjs/swagger's type
// inference all read TypeScript's `design:*` reflect-metadata, which esbuild (Vitest's
// default transform) does not emit. `unplugin-swc` transforms via SWC with decorator
// metadata enabled instead, so the app behaves under test exactly as it does when
// built with `tsc` (see tsconfig.json's experimentalDecorators/emitDecoratorMetadata).
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts', 'node_modules/**'],
    env: {
      // Dummy, never-dialled connection string: PrismaClient parses DATABASE_URL at
      // construction time even though it only connects lazily on first query, so
      // booting the Nest app (e.g. for the OpenAPI contract test) needs a syntactically
      // valid value here — no real database is contacted by anything in this job.
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/steuereule_unit_test?schema=public',
      GUEST_SESSION_SECRET: 'unit-test-secret',
      // Fixed synthetic key (ADR-0008) — never a real secret, only fed to a Prisma
      // client that never actually connects/queries in this no-DB job.
      PRISMA_FIELD_ENCRYPTION_KEY: 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      NODE_ENV: 'test',
      VITEST: 'true',
    },
  },
})
