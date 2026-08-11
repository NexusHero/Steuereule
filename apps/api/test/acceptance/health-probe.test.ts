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
  // probe. Measured directly — swapping HealthModule's `assertDatabaseReachable` for
  // `async () => {}` leaves both green (see this PR's own report for the run). This test
  // closes that gap using the REAL, production-wired `assertDatabaseReachable` (never a
  // stub or a mock) pointed at a target nothing is listening on, so the only way this can
  // pass is if the readiness path actually attempts a live connection and lets it fail —
  // an inert stub would still answer 200 here, which is exactly what would go red.
  //
  // `DATABASE_URL` is mutated on the live `process.env` (not passed as an argument)
  // because that is genuinely how `assertDatabaseReachable`'s default parameter resolves
  // it in production — `HealthModule` wires the bare function, not a closure over a
  // fixed URL — so this exercises the identical resolution path the real server uses on
  // every request, not a parallel one invented for the test. Restored in `finally` so no
  // later test in this file (or, since `fileParallelism: false`, this suite) inherits a
  // broken `DATABASE_URL`. Port 1 is unprivileged-inaccessible on this OS and nothing in
  // this stack ever binds to it, so the connection fails fast (measured: ~120ms, refused
  // — not the 5s reachability timeout) rather than this test waiting one out.
  it('readiness performs a REAL database probe, not a wired-to-succeed stub: pointed at a target nothing is listening on, it answers 503', async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://steuereule:steuereule@127.0.0.1:1/steuereule'
    try {
      const response = await fetch(`${baseUrl}/v1/health/ready`)

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ status: 'error' })
    } finally {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  })
})
