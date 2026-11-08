import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

describe('Chaos & Resilience: Transient Database Dropout and Recovery (SRE Posture)', () => {
  let app: NestFastifyApplication

  afterEach(async () => {
    await app.close()
  })

  it('automatically recovers from a 503 readiness failure back to 200 OK once connectivity restores', async () => {
    let isDbHealthy = true

    const built = await buildTestApp({
      databaseReachabilityCheck: async () => {
        if (!isDbHealthy) {
          throw new Error('Connection refused: database packet timeout')
        }
      },
    })
    app = built.app

    // 1. Initial State: Healthy
    const initialReady = await app.inject({ method: 'GET', url: '/v1/health/ready' })
    expect(initialReady.statusCode).toBe(200)
    expect(initialReady.json()).toEqual({ status: 'ok' })

    // 2. Chaos Event: Transient Database Drop (Network Blip / Cloud SQL maintenance failover)
    isDbHealthy = false
    const failedReady = await app.inject({ method: 'GET', url: '/v1/health/ready' })
    expect(failedReady.statusCode).toBe(503)
    expect(failedReady.json()).toEqual({ status: 'error' })

    // 3. Process Liveness Stays Intact (Container does NOT enter a crash loop!)
    const liveDuringDrop = await app.inject({ method: 'GET', url: '/v1/health/live' })
    expect(liveDuringDrop.statusCode).toBe(200)
    expect(liveDuringDrop.json()).toEqual({ status: 'ok' })

    // 4. Recovery: Database reconnects
    isDbHealthy = true
    const recoveredReady = await app.inject({ method: 'GET', url: '/v1/health/ready' })
    expect(recoveredReady.statusCode).toBe(200)
    expect(recoveredReady.json()).toEqual({ status: 'ok' })
  })
})
