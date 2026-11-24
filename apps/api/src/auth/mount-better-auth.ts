import { Logger } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Auth } from 'better-auth'
import { toNodeHandler } from 'better-auth/node'
import { applyRawCorsHeaders } from '../cors/apply-raw-cors-headers.js'

export const BETTER_AUTH_PATH_PREFIX = '/api/auth/'

/**
 * The largest legitimate auth request is a passkey attestation or an OAuth client registration, a few KiB; a
 * sign-up or password change a few hundred bytes. Past this the body is refused with 413 (ADR-0109).
 */
export const AUTH_BODY_LIMIT_BYTES = 64 * 1024

const logger = new Logger('BetterAuthMount')

class BodyTooLargeError extends Error {
  readonly statusCode = 413
  constructor() {
    super(`The request body is larger than ${AUTH_BODY_LIMIT_BYTES} bytes.`)
  }
}

/** Reads the body up to the cap, by Content-Length first and then while it streams (a chunked body has none). */
function readBounded(request: IncomingMessage, payload: NodeJS.ReadableStream): Promise<string> {
  const declared = Number(request.headers['content-length'])
  if (declared > AUTH_BODY_LIMIT_BYTES) return Promise.reject(new BodyTooLargeError())
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let refused = false
    payload.on('data', (chunk: Buffer) => {
      if (refused) return
      size += chunk.length
      if (size > AUTH_BODY_LIMIT_BYTES) {
        refused = true
        chunks.length = 0
        reject(new BodyTooLargeError())
        // The 413 needs the connection to write to; once it is out, the rest of the upload is cut off.
        setTimeout(() => request.destroy(), 1_000).unref()
        return
      }
      chunks.push(chunk)
    })
    payload.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    payload.on('error', reject)
  })
}

export async function mountBetterAuthHandler(app: NestFastifyApplication, auth: Auth): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance()
  const handler = toNodeHandler(auth)

  await fastify.register(async (authScope) => {
    // better-auth reads the body itself, from the raw request: the parser reads it once, bounded, and puts the
    // text where better-auth looks for an already consumed body (`req.body`), so the token request of an OAuth
    // client (application/x-www-form-urlencoded, RFC 6749 § 4.1.3) still arrives whole (#450 5A, ADR-0109).
    for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
      if (authScope.hasContentTypeParser(contentType)) authScope.removeContentTypeParser(contentType)
      authScope.addContentTypeParser(contentType, (request, payload, done) => {
        readBounded(request.raw, payload).then(
          (text) => {
            ;(request.raw as IncomingMessage & { body?: unknown }).body = text
            done(null, text)
          },
          (error: unknown) => done(error as Error),
        )
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
