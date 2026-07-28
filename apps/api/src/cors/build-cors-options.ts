// The single source of the credentialed-CORS policy (ADR-0011) that `app.enableCors(...)`
// is configured with — imported by both `main.ts` (production wiring) and
// `test/cors.acceptance.test.ts` (the acceptance evidence that the policy actually behaves
// the way it's declared). Before this existed, the two carried independent, hand-written
// copies of the same options object and drifted: the test's `methods` list fell behind
// production's when `DELETE` was added for REQ-011's `DELETE /v1/account`, so the
// acceptance suite kept passing while quietly no longer proving what production served.
// A test that mirrors config by hand instead of importing it isn't evidence of anything —
// this makes that drift structurally impossible: change the policy here, and both callers
// pick it up.
//
// `methods` must be given explicitly: @fastify/cors@11.2.0 defaults to `GET,HEAD,POST`
// when omitted, silently excluding PUT — which blocked every credentialed cross-origin
// `PUT /v1/profile` (Onboarding save, guest→account upgrade, the Profil screen) at the
// browser's preflight (caught live by Salih's cross-origin re-test; see
// test/cors.acceptance.test.ts). Listed to match the REST surface this API actually
// serves — not a blanket allow-all. DELETE added for REQ-011's `DELETE /v1/account`
// (ADR-0013) — the same preflight gap PUT hit earlier would otherwise silently block it
// too.
//
// `exposedHeaders: ['Content-Disposition']` — `Content-Disposition` is not one of the
// CORS-safelisted response headers a browser exposes to page JS by default. Found live
// during a real cross-origin browser QA pass of the export download (REQ-011/ADR-0013,
// steuereule#152): `curl`/Node's `fetch()` never enforce CORS, so they happily read the
// header regardless — only an actual browser hides it, silently falling the download's
// filename back to a generic `steuereule-export.json` on every deployment where the web
// app and API sit on different origins (ADR-0011's own architecture). Same
// invisible-to-non-browser-tooling class of bug as #106/#108; dropping this would
// silently regress that fix.
// `FastifyCorsOptions` (not @nestjs/common's own, looser `CorsOptions`) because that's
// what `NestFastifyApplication.enableCors()` is actually typed to accept — @fastify/cors
// is already a real runtime dependency here transitively via @nestjs/platform-fastify;
// listed explicitly as a devDependency purely so this type-only import resolves under
// pnpm's strict per-package resolution, nothing new ships at runtime.
import type { FastifyCorsOptions } from '@fastify/cors'
import { resolveCorsOrigins } from './resolve-cors-origins.js'

export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): FastifyCorsOptions {
  return {
    origin: resolveCorsOrigins(env),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
  }
}
