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
})
