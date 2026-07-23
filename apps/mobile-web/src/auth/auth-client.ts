// The one better-auth client construction site (mirrors packages/api-client/src/http-client.ts's
// "one fetch call site" rule for the Profile API). better-auth's client SDK is a fixed contract —
// mounted server-side as a Fastify catch-all on `/api/auth/*` (ADR-0012 §1) — so the frontend
// build is not blocked on the backend landing; it targets the library's own, versioned shape.
//
// better-auth's `createAuthClient` takes its origin at construction time (there is no mutable
// `configure*` setter the way the generated Profile client has), so the origin is injected here
// as a plain factory argument — the app's entry point calls this once, exactly like it calls
// `configureApiClient` (12-Factor III: the origin is env-driven config, never a baked-in host).
//
// `credentials: 'include'` is better-auth's own default whenever the runtime's `Request` supports
// it (true for both the real browser and Node's fetch) — required for the cross-site demo
// (ADR-0011/0012, session cookie is `SameSite=None; Secure`). Not re-specified here to avoid a
// second, driftable copy of that default; see better-auth's `getClientConfig`.
import { createAuthClient } from 'better-auth/react'

/** Mount point ADR-0012 §1 fixes for better-auth on the API (Fastify catch-all, outside Nest). */
const AUTH_BASE_PATH = '/api/auth'

export function createAppAuthClient(baseUrl: string) {
  return createAuthClient({ baseURL: baseUrl, basePath: AUTH_BASE_PATH })
}

export type AppAuthClient = ReturnType<typeof createAppAuthClient>
