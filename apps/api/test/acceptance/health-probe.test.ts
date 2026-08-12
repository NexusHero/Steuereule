// #279 — the ONE test in this suite that actually proves readiness reflects a REAL
// Postgres, not a mock. Real Postgres, real socket, real `buildApp()` boot (never
// `.inject()`), same tier and same reasoning as req-009-session-model.test.ts's own
// header comment. Runs via `pnpm --filter @steuereule/api test:integration` — never
// the plain no-DB `test` job (ADR-0004); health.controller.test.ts covers the
// controller/disclosure contract there with a stubbed check.
//
// This is deliberately NOT a REQ-tagged acceptance test (#279 is infrastructure, not a
// register requirement) — it lives in test/acceptance/ anyway because it shares the
// same real-Postgres, real-HTTP tier as every REQ-tagged suite here, not the
// file-suffix convention.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

process.env.GUEST_SESSION_SECRET = 'health-probe-secret'

describe('#279 — GET /v1/health/live and /v1/health/ready, against the real server', () => {
  let app: NestFastifyApplication
  let baseUrl: string

  beforeAll(async () => {
    const { buildApp } = await import('../../src/main.js')
    app = await buildApp()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterAll(async () => {
    await app.close()
  })

  it('liveness answers 200 without touching the database', async () => {
    const response = await fetch(`${baseUrl}/v1/health/live`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  it('readiness answers 200 against the real, migrated integration Postgres', async () => {
    const response = await fetch(`${baseUrl}/v1/health/ready`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
  })

  // #338 F2 (Salih's review) — the two tests above do NOT discriminate: they only prove
  // readiness is WIRED to something that resolves, not that it performs a real database
  // probe. Measured directly — swapping HealthModule's real provider for
  // `async () => {}` left both green (see this PR's own report for that run).
  //
  // REDESIGNED under #338 F1 (Musti's §4): the first version of this test mutated
  // `process.env.DATABASE_URL` on the ALREADY-BOOTED `app` above and expected readiness
  // to pick it up — that was true of #275's `assertDatabaseReachable` (which re-read
  // `process.env` on every call, itself part of F1's finding) but is FALSE of the F1 fix,
  // which probes through `PrismaService`'s own connection, bound once at construction.
  // Measured directly, unfiltered, after the F1 fix landed: the mutated-env version of
  // this test now answers 200, not 503 — confirmed empirically, not assumed, before being
  // rewritten below. Silently leaving a test that asserts the OLD implementation's
  // resolution path would be exactly the green-theatre trap this PR's own F2 exists to
  // close a second time.
  //
  // The correct discriminator for the new mechanism: `PrismaClient`'s datasource is read
  // from `DATABASE_URL` once, at construction — so a SECOND, throwaway `buildApp()`
  // instance, built with `DATABASE_URL` pointed at a target nothing is listening on
  // (port 1) at the moment of construction, has a `PrismaService` that can never
  // successfully connect. Its readiness endpoint can only answer 503 if the real,
  // production-wired probe actually attempts I/O against that broken connection — an
  // inert stub would still answer 200 regardless of what `DATABASE_URL` says, which is
  // exactly what would go red under this test. `DATABASE_URL` is restored immediately
  // after `buildApp()` resolves (all providers, including `PrismaService`, are
  // constructed synchronously within that one `await` — see `main.ts`'s `buildApp()`),
  // so no other test in this suite (`fileParallelism: false`) is exposed to the broken
  // value even momentarily.
  it('readiness performs a REAL database probe, not a wired-to-succeed stub: a second app built against a target nothing is listening on answers 503', async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://steuereule:steuereule@127.0.0.1:1/steuereule'
    let unreachableApp: NestFastifyApplication | undefined
    try {
      const { buildApp } = await import('../../src/main.js')
      unreachableApp = await buildApp()
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl
    }

    try {
      await unreachableApp.listen(0, '127.0.0.1')
      const unreachableBaseUrl = await unreachableApp.getUrl()

      const response = await fetch(`${unreachableBaseUrl}/v1/health/ready`)

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ status: 'error' })
    } finally {
      await unreachableApp.close()
    }
  })
})
