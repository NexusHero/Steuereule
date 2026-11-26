// ADR-0101 §20: the self-employment switch, read by the client before any year exists (09b, CI 20.11.2026).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParseTaxYearPipe } from '../src/common/parse-tax-year.pipe.js'
import { runningTaxYear } from '../src/common/tax-year.js'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'capabilities-http-test-secret'

describe('GET /v1/capabilities', () => {
  let app: NestFastifyApplication
  const before = process.env.SELBSTSTAENDIGE_ENABLED

  afterEach(async () => {
    vi.useRealTimers()
    if (before === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = before
    await app.close()
  })

  it('reports the switch on, without a session', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    ;({ app } = await buildTestApp())
    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ selbststaendig: true, runningTaxYear: runningTaxYear() })
  })

  it('reports the switch off', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    ;({ app } = await buildTestApp())
    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' })
    expect(response.json()).toMatchObject({ selbststaendig: false })
  })

  it('OPS-16: names the running tax year by the server clock; in 2027 it is 2027', async () => {
    ;({ app } = await buildTestApp())
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-01-01T00:30:00+01:00') })
    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' })
    expect(response.json()).toMatchObject({ runningTaxYear: 2027 })
    // The pipe reads the same clock: 2028 (receipts of the coming year) is accepted, 2029 is not.
    expect(new ParseTaxYearPipe().transform('2028')).toBe(2028)
    expect(() => new ParseTaxYearPipe().transform('2029')).toThrow(/between 2000 and 2028/)
  })
})

describe('runningTaxYear (OPS-16)', () => {
  it('turns at midnight in Berlin, whatever the host time zone', () => {
    expect(runningTaxYear(new Date('2026-12-31T22:59:59Z'))).toBe(2026)
    expect(runningTaxYear(new Date('2026-12-31T23:00:00Z'))).toBe(2027)
  })
})
