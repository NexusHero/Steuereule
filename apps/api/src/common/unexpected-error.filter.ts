import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { structuredErrorLogging, writeErrorReport } from './error-report.js'

/**
 * Catches what no other filter does. In production an unexpected error (anything but a 4xx HttpException) is
 * logged as one structured line for Error Reporting; the client gets Nest's usual 500 either way. Everywhere
 * else Nest's own handling and log output stay as they are. Registered before DomainErrorFilter in AppModule, which is how Nest lets the specific filter win.
 */
@Catch()
export class UnexpectedErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (structuredErrorLogging() && status >= 500) {
      const request = host.switchToHttp().getRequest<FastifyRequest | undefined>()
      writeErrorReport({ error: exception, route: request?.routeOptions?.url, method: request?.method, requestId: request?.id, status })
      // Answer like Nest, but without its text log: the line above is the record.
      const body = exception instanceof HttpException ? exception.getResponse() : { statusCode: 500, message: 'Internal server error' }
      this.httpAdapterHost?.httpAdapter.reply(host.switchToHttp().getResponse(), body, status)
      return
    }
    super.catch(exception, host)
  }
}
