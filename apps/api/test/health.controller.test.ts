// #279 — no-DB unit/HTTP tests for the liveness/readiness endpoints, driven over real
// HTTP via light-my-request (no live Postgres required — ADR-0004). Proves the
// controller/service wiring and the disclosure discipline (never leak more than
// `{status}`); the real-database claim ("readiness actually reflects the real Postgres")
// is proven separately, against a real service, by test/acceptance/health-probe.test.ts.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

describe('GET /v1/health/live', () => {
  let app: NestFastifyApplication

  afterEach(async () => {
    await app.close()
  })

  it('always returns 200 {status: "ok"} — checks nothing beyond the process itself', async () => {
    // The default stub would make this trivially true either way; make the point by
    // wiring a reachability check that ALWAYS fails and asserting liveness ignores it
    // entirely — proving live/ready are genuinely independent, not just two names for
    // the same check.
    const built = await buildTestApp({
      databaseReachabilityCheck: async () => {
        throw new Error('the database is down')
      },
    })
    app = built.app

    const response = await app.inject({ method: 'GET', url: '/v1/health/live' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /v1/health/ready', () => {
  let app: NestFastifyApplication

  afterEach(async () => {
    await app.close()
  })

  it('returns 200 {status: "ok"} when the database is reachable', async () => {
    const built = await buildTestApp({ databaseReachabilityCheck: async () => {} })
    app = built.app

    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('returns 503 {status: "error"} when the database is unreachable — and never leaks the underlying finding', async () => {
    const built = await buildTestApp({
      databaseReachabilityCheck: async () => {
        // A realistic shape: assertDatabaseReachable's own redacted message, which
        // still names the host:port target — exactly what this endpoint must not
        // hand to an unauthenticated caller even though it's already redacted once.
        throw new Error('Cannot reach the database at db.internal:5432 within 5000ms — refusing to start.')
      },
    })
    app = built.app

    const response = await app.inject({ method: 'GET', url: '/v1/health/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'error' })
    // Nest's default HttpException body ({statusCode, message, error}) must not leak
    // through underneath the object passed to ServiceUnavailableException.
    expect(response.body).not.toContain('db.internal')
    expect(response.body).not.toContain('Cannot reach the database')
  })
})
