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
  return createAuthClient({
    baseURL: baseUrl,
    basePath: AUTH_BASE_PATH,
    // Pinned explicitly rather than left to inherit better-auth's own default (Musti's T1,
    // #194, ADR-0012 amendment): RegistrierungScreen's "please verify your email" banner
    // depends on the session atom re-fetching when the user returns to this tab after
    // verifying out-of-band (their mail client, possibly another device) — an *honesty*
    // behaviour, not a convenience one. better-auth 1.6.24 already defaults
    // `refetchOnWindowFocus` to `true`, but a future minor bump silently flipping that
    // default would quietly break the fix without touching a single line here. Recording
    // the dependency as config, not an assumption.
    sessionOptions: { refetchOnWindowFocus: true },
  })
}

export type AppAuthClient = ReturnType<typeof createAppAuthClient>
