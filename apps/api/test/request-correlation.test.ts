import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { buildApp } from '../src/main.js'

describe('HTTP Request Correlation & Trace Propagation', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await buildApp()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('generates a fresh UUID in x-request-id header when none provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health/live',
    })

    expect(response.statusCode).toBe(200)
    const reqId = response.headers['x-request-id']
    expect(reqId).toBeDefined()
    expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('echoes back incoming x-request-id for client-side correlation', async () => {
    const customId = 'client-session-987654321'
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health/live',
      headers: {
        'x-request-id': customId,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toBe(customId)
  })

  it('extracts and echoes W3C traceparent trace-id as x-request-id', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'
    const response = await app.inject({
      method: 'GET',
      url: '/v1/health/live',
      headers: {
        traceparent: `00-${traceId}-00f067aa0ba902b7-01`,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-request-id']).toBe(traceId)
  })
})
