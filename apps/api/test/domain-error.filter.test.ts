import type { ArgumentsHost } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainErrorFilter } from '../src/common/domain-error.filter.js'
import { ConflictError, type DomainError, InvalidInputError, NotFoundError, UnavailableError } from '../src/common/domain-error.js'

function fakeHost() {
  const reply = { statusCode: 0, body: undefined as unknown }
  const response = {
    status(code: number) {
      reply.statusCode = code
      return response
    },
    send(body: unknown) {
      reply.body = body
      return response
    },
  }
  const request = { method: 'PUT', url: '/v1/steuerjahre/2025/kapital/x?y=1', routeOptions: { url: '/v1/steuerjahre/:jahr/kapital/:feld' } }
  const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as unknown as ArgumentsHost
  return { host, reply }
}

describe('DomainErrorFilter', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each<[DomainError, number]>([
    [new InvalidInputError('FIELD_VALUE_INVALID', 'bad'), 400],
    [new NotFoundError('BELEG_NOT_FOUND', 'missing'), 404],
    [new ConflictError('ALREADY_TAKEN_OVER', 'twice'), 409],
    [new UnavailableError('PAYMENT_NOT_CONFIGURED', 'off'), 503],
  ])('maps %s to HTTP %i with a stable code in the body', (error, status) => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const { host, reply } = fakeHost()

    new DomainErrorFilter().catch(error, host)

    expect(reply.statusCode).toBe(status)
    expect(reply.body).toMatchObject({ statusCode: status, code: error.code, message: error.message })
  })

  it('logs the route pattern and code, never the concrete URL', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const { host } = fakeHost()

    new DomainErrorFilter().catch(new InvalidInputError('FIELD_VALUE_INVALID', 'bad'), host)

    expect(warn).toHaveBeenCalledWith('PUT /v1/steuerjahre/:jahr/kapital/:feld → 400 FIELD_VALUE_INVALID')
  })

  it('logs server-side unavailability as an error', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const { host } = fakeHost()

    new DomainErrorFilter().catch(new UnavailableError('PAYMENT_NOT_CONFIGURED', 'off'), host)

    expect(error).toHaveBeenCalledOnce()
  })
})
