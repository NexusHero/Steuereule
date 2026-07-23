// Security headers/CSP (REQ-010/ADR-0009/ADR-0012 §5) via `@fastify/helmet` — a
// pre-sanctioned dependency, registered once, not per-route. `helmet`'s own default
// Content-Security-Policy already disallows inline/unsafe script (`script-src: 'self'`
// with no `unsafe-inline`/`unsafe-eval`) — no extra config is needed to get that.
//
// `/docs` (Swagger UI, @nestjs/swagger) is the one documented exception: it renders
// via an inline bootstrap script/style, which a strict CSP would otherwise break. Nest's
// SwaggerModule registers its routes as ordinary Fastify routes, so `@fastify/helmet`'s
// own per-route `{ helmet: false }` opt-out (see its README) applies here too — this
// just needs to be *set* on those routes before helmet's own `onRoute` hook reads it.
// A tiny `onRoute` hook registered ahead of both `@fastify/helmet` and
// `SwaggerModule.setup()` tags any `/docs*` route with `helmet: false` as it's added;
// every other route is untouched and gets the full, strict default policy.
import fastifyHelmet from '@fastify/helmet'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'

const DOCS_PATH_PREFIX = '/docs'

export async function registerHelmet(app: NestFastifyApplication): Promise<void> {
  const fastify = app.getHttpAdapter().getInstance()

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.startsWith(DOCS_PATH_PREFIX)) {
      routeOptions.helmet = false
    }
  })

  await app.register(fastifyHelmet, { global: true })
}
