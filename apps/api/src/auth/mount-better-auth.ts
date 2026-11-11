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
    // better-auth reads the raw body itself. Hand JSON and form bodies through unread: OAuth clients
    // post the token request as application/x-www-form-urlencoded (RFC 6749 § 4.1.3), and a stream a
    // parser already consumed arrives empty (#450 5A).
    for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
      if (authScope.hasContentTypeParser(contentType)) authScope.removeContentTypeParser(contentType)
      authScope.addContentTypeParser(contentType, (_request, payload, done) => {
        done(null, payload)
      })
    }

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
