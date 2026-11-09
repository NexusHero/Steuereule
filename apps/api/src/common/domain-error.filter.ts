import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus, Logger } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { DomainError, type DomainErrorKind } from './domain-error.js'

const HTTP_MAPPING: Record<DomainErrorKind, { status: HttpStatus; reason: string }> = {
  'invalid-input': { status: HttpStatus.BAD_REQUEST, reason: 'Bad Request' },
  'not-found': { status: HttpStatus.NOT_FOUND, reason: 'Not Found' },
  conflict: { status: HttpStatus.CONFLICT, reason: 'Conflict' },
  forbidden: { status: HttpStatus.FORBIDDEN, reason: 'Forbidden' },
  unauthenticated: { status: HttpStatus.UNAUTHORIZED, reason: 'Unauthorized' },
  unavailable: { status: HttpStatus.SERVICE_UNAVAILABLE, reason: 'Service Unavailable' },
  'rate-limited': { status: HttpStatus.TOO_MANY_REQUESTS, reason: 'Too Many Requests' },
}

export interface ErrorResponseBody {
  statusCode: number
  error: string
  code: string
  message: string
  details?: Readonly<Record<string, unknown>>
  requestId?: string
}

/** Translates every DomainError into one uniform HTTP error body and logs it without request data. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainErrorFilter.name)

  catch(error: DomainError, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<FastifyRequest>()
    const reply = http.getResponse<FastifyReply>()
    const { status, reason } = HTTP_MAPPING[error.kind]
    const body: ErrorResponseBody = {
      statusCode: status,
      error: reason,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(request?.id ? { requestId: request.id } : {}),
    }

    this.log(error, status, request)
    void reply.status(status).send(body)
  }

  private log(error: DomainError, status: number, request: FastifyRequest): void {
    const prefix = request?.id ? `[${request.id}] ` : ''
    const line = `${prefix}${request.method} ${request.routeOptions?.url ?? request.url} → ${status} ${error.code}`
    if (status >= 500) this.logger.error(line)
    else this.logger.warn(line)
  }
}
