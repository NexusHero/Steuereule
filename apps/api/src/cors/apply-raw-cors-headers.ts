// The one seam that never runs Fastify's `onSend` hook chain (mount-better-auth.ts's
// `reply.hijack()`'d route) still needs the same credentialed-CORS decision every
// ordinary Nest/Fastify route gets from `app.enableCors(...)` (backed by
// @fastify/cors). Rather than a second, hand-rolled CORS policy, this applies that
// exact decision directly onto the raw Node `ServerResponse` — reusing
// `resolveCorsOrigins()` as the single allowlist source of truth (see
// auth.module.ts's `trustedOrigins` for the same reuse rule applied to CSRF).
//
// Mirrors @fastify/cors's behaviour for a static origin array + `credentials: true`
// (verified against a real booted server, both routes side by side): `Vary: Origin`
// and `Access-Control-Allow-Credentials: true` are set unconditionally (regardless of
// whether an Origin header was even sent); `Access-Control-Allow-Origin` echoes the
// request's Origin only when it is an allow-listed exact match — fail-closed, never
// `*`, never a blanket reflection of an arbitrary origin.
import type { ServerResponse } from 'node:http'
import { resolveCorsOrigins } from './resolve-cors-origins.js'

export function applyRawCorsHeaders(
  requestOrigin: string | string[] | undefined,
  res: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const origin = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin

  const existingVary = res.getHeader('Vary')
  res.setHeader('Vary', existingVary ? `${existingVary}, Origin` : 'Origin')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (origin && resolveCorsOrigins(env).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }
}
