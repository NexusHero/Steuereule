// Mounts better-auth as a raw Fastify catch-all on `/api/auth/*`, OUTSIDE the Nest
// controller pipeline (ADR-0012 §1). better-auth's handler is a Web-Fetch
// `(Request) => Response`; better-auth's own `toNodeHandler` bridges that straight to
// Node's raw `(IncomingMessage, ServerResponse)` pair — exactly what Fastify's
// `request.raw`/`reply.raw` are, so no hand-rolled Request/Response translation is
// needed here.
//
// The one piece of wiring this genuinely needs: Fastify's default JSON content-type
// parser would otherwise drain `request.raw`'s body stream before this route's
// handler ever runs, leaving `toNodeHandler` nothing to read. The fix is registered
// inside a *child* Fastify plugin context (`fastify.register(async (scope) => ...)`),
// which is its own encapsulated scope for content-type parsers — a parser added there
// shadows the default JSON parser only for routes registered inside that same scope,
// never for Nest's routes at the root scope (see Fastify's ContentTypeParser
// encapsulation, `docs/Reference/ContentTypeParser.md`). Passing the parser fn with
// `opts` unset skips `parseAs: 'buffer'|'string'` — the only way to make Fastify hand
// the *live, undrained* stream straight through instead of consuming it for us.
//
// `removeContentTypeParser` first is required, not cosmetic: Nest's own
// FastifyAdapter already re-registers `application/json` at the root
// (`registerJsonContentParser`, wrapping Fastify's default parser in its own
// closure) as part of normal bootstrap, so by the time this mounts, the *cloned*
// parser this child scope inherits is no longer indistinguishable from Fastify's
// pristine default — Fastify's own "already customized" guard then refuses a second
// `addContentTypeParser('application/json', ...)` in the child outright. Removing it
// from the child's own (already-isolated, cloned) parser map first sidesteps that
// guard without touching the root's real parser at all — proven with a real Nest+
// Fastify boot, not just a raw-Fastify assumption (`.inject()`-blind class of bug).
//
// This mount is genuinely `.inject()`-blind (light-my-request never opens a real
// socket, so a raw-stream-consuming bug like this wouldn't surface) — it must be
// proven by booting the real server and hitting `/api/auth/*` over real HTTP
// (ADR-0010/ADR-0012 §1; see test/auth-boot.smoke.test.ts).
import { Logger } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Auth } from 'better-auth'
import { toNodeHandler } from 'better-auth/node'

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
      // better-auth's toNodeHandler writes the response directly onto the raw Node
      // ServerResponse — hijack() tells Fastify not to also try to send one itself.
      reply.hijack()
      try {
        await handler(request.raw, reply.raw)
      } catch (error) {
        // toNodeHandler has no internal try/catch of its own — an error thrown
        // *outside* better-auth's own request-handling (a genuine bug, e.g. a
        // misconfigured adapter) would otherwise leave the hijacked connection with
        // no response ever written, hanging the caller forever rather than failing
        // fast. Never silently swallowed — logged, then a plain 500.
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
