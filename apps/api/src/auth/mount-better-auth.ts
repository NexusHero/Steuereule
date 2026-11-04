import { Logger } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Auth } from 'better-auth'
import { toNodeHandler } from 'better-auth/node'
import { applyRawCorsHeaders } from '../cors/apply-raw-cors-headers.js'

export const BETTER_AUTH_PATH_PREFIX = '/api/auth/'

const logger = new Logger('BetterAuthMount')

export async function mountBetterAuthHandler(app: NestFastifyApplication, auth: Auth): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance()
  const handler = toNodeHandler(auth)

  await fastify.register(async (authScope) => {
    authScope.removeContentTypeParser('application/json')
    authScope.addContentTypeParser('application/json', (_request, payload, done) => {
      done(null, payload)
    })

    authScope.all(`${BETTER_AUTH_PATH_PREFIX}*`, async (request, reply) => {
      applyRawCorsHeaders(request.headers.origin, reply.raw)
      reply.hijack()
      try {
        await handler(request.raw, reply.raw)
      } catch (error) {
        logger.error(`Unhandled error in better-auth request handler: ${String(error)}`, (error as Error)?.stack)
        if (!reply.raw.headersSent) {
          reply.raw.writeHead(500, { 'content-type': 'application/json' })
          reply.raw.end(JSON.stringify({ message: 'Internal server error' }))
        } else {
          reply.raw.end()
        }
      }
    })
  })
}
