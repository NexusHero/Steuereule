import { describe, expect, it, vi } from 'vitest'
import { Controller, Get, HttpException, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { NotFoundError } from '../src/common/domain-error.js'
import { DomainErrorFilter } from '../src/common/domain-error.filter.js'
import { ERROR_REPORT_PREFIX, formatErrorReport, structuredErrorLogging, writeErrorReport } from '../src/common/error-report.js'
import { UnexpectedErrorFilter } from '../src/common/unexpected-error.filter.js'

describe('formatErrorReport', () => {
  it('is an Error Reporting event: severity, the stack in message, request id and route template', () => {
    const error = new TypeError('cannot read x')
    const report = formatErrorReport({ error, route: '/v1/receipts/:id', method: 'GET', requestId: 'req-1', status: 500 })

    expect(report.severity).toBe('ERROR')
    expect(report['@type']).toBe('type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent')
    // The alert's log-based metric matches on this start (infra/gcp/monitoring.tf).
    expect(String(report.message).startsWith(`${ERROR_REPORT_PREFIX}: TypeError: cannot read x\n    at `)).toBe(true)
    expect(report.requestId).toBe('req-1')
    expect(report.context).toEqual({ httpRequest: { method: 'GET', url: '/v1/receipts/:id', responseStatusCode: 500 } })
  })

  it('carries no body, header, cookie, query or token — only the fields it is given', () => {
    const report = formatErrorReport({
      error: new Error('boom'),
      route: '/v1/profile',
      method: 'PUT',
      requestId: 'r',
      // What a careless caller might hand over; the formatter has no field for any of it.
      ...({ body: { steuerId: '02476291358' }, headers: { cookie: 'secret' }, url: '/v1/profile?token=abc' } as object),
    })
    const text = JSON.stringify(report)
    expect(text).not.toContain('02476291358')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('token=abc')
    expect(Object.keys(report).sort()).toEqual(['@type', 'context', 'message', 'requestId', 'serviceContext', 'severity'])
  })

  it('shortens a long message, names a non-Error, and writes exactly one JSON line', () => {
    const lines: string[] = []
    writeErrorReport({ error: 'x'.repeat(5000) }, (line) => lines.push(line))
    expect(lines).toHaveLength(1)
    expect(lines[0]!.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(lines[0]!) as { message: string }
    expect(parsed.message.startsWith('Unhandled error: string: xxx')).toBe(true)
    expect(parsed.message.length).toBeLessThan(400)
  })

  it('is on in production only', () => {
    expect(structuredErrorLogging({ NODE_ENV: 'production' })).toBe(true)
    expect(structuredErrorLogging({ NODE_ENV: 'development' })).toBe(false)
    expect(structuredErrorLogging({})).toBe(false)
  })
})

@Controller('boom')
class BoomController {
  @Get('crash') crash(): never { throw new Error('secret value 02476291358') }
  @Get('teapot') teapot(): never { throw new HttpException('short and stout', 418) }
  @Get('domain') domain(): never { throw new NotFoundError('THING_NOT_FOUND', 'no such thing') }
}

@Module({
  controllers: [BoomController],
  providers: [
    { provide: APP_FILTER, useClass: UnexpectedErrorFilter },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
class BoomModule {}

describe('UnexpectedErrorFilter', () => {
  async function boot(): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [BoomModule] }).compile()
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    return app
  }

  it('in production logs one structured line for a 500 and answers like Nest does', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const app = await boot()
    try {
      const response = await app.inject({ method: 'GET', url: '/boom/crash?token=abc', headers: { cookie: 'session=xyz' } })
      expect(response.statusCode).toBe(500)
      expect(response.json()).toEqual({ statusCode: 500, message: 'Internal server error' })
      const line = write.mock.calls.map((call) => String(call[0])).find((text) => text.includes('Unhandled error'))!
      const report = JSON.parse(line) as { message: string; context: { httpRequest: { url: string } } }
      expect(report.context.httpRequest.url).toBe('/boom/crash')
      expect(line).not.toContain('token=abc')
      expect(line).not.toContain('session=xyz')
    } finally {
      write.mockRestore()
      vi.unstubAllEnvs()
      await app.close()
    }
  })

  it('leaves a 4xx HttpException and a DomainError to their own handling, in production too', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const app = await boot()
    try {
      const teapot = await app.inject({ method: 'GET', url: '/boom/teapot' })
      expect(teapot.statusCode).toBe(418)
      const domain = await app.inject({ method: 'GET', url: '/boom/domain' })
      expect(domain.statusCode).toBe(404)
      expect(domain.json()).toMatchObject({ code: 'THING_NOT_FOUND' })
      expect(write.mock.calls.some((call) => String(call[0]).includes('Unhandled error'))).toBe(false)
    } finally {
      write.mockRestore()
      vi.unstubAllEnvs()
      await app.close()
    }
  })

  it('outside production writes no structured line', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const app = await boot()
    try {
      const response = await app.inject({ method: 'GET', url: '/boom/crash' })
      expect(response.statusCode).toBe(500)
      expect(write.mock.calls.some((call) => String(call[0]).includes('ReportedErrorEvent'))).toBe(false)
    } finally {
      write.mockRestore()
      await app.close()
    }
  })
})
