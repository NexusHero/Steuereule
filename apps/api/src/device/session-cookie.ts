// Reimplements better-auth's own signed-cookie wire format (#238 task 2, ADR-0024)
// — needed because the device-authorization plugin's `/device/token` route never
// calls better-auth's `setSessionCookie` at all (Musti's #238 review, finding (a)):
// it hands back a Bearer token in the JSON body instead of a cookie. This app must
// set the *same* cookies better-auth would have, in the *same* signed format, so
// that a later `auth.api.getSession()` call (UserContextGuard, on every subsequent
// request) can read them back correctly.
//
// The format is not guessed — it's transcribed from the actual signing dependency
// better-auth's `setSessionCookie` calls through (`ctx.setSignedCookie`,
// `better-call@1.3.7`'s `dist/crypto.mjs` `signCookieValue`/`dist/context.mjs`
// `setSignedCookie`): HMAC-SHA256 over the raw value, standard (non-URL-safe)
// base64, joined as `${value}.${signature}`. That function's own secret is
// `ctx.context.secret`, which better-auth's `createAuthContext`
// (`context/create-context.mjs`) sets to *exactly* the `secret` string passed to
// `betterAuth({ secret })` — no hashing/derivation — so `resolveBetterAuthSecret()`
// (the same function AuthModule already uses to construct that instance) is the
// right key here too.
//
// Proven correct by round-tripping through the *real* better-auth instance, not just
// asserted against the algorithm description:
// test/acceptance/req-014-device-approve-token.integration.test.ts sets cookies via
// this function and confirms `auth.api.getSession()` reads them back correctly —
// including the "just for now" branch's *second* read, which is what caught the
// need for the `dontRememberToken` cookie below in the first place (see its own
// doc comment).
import { createHmac } from 'node:crypto'

/**
 * Signs `value` into the exact wire format better-auth's own
 * `getSignedCookie`/`getSession` expect to read back. `secret` must be the same
 * string passed to `betterAuth({ secret })` (see `resolveBetterAuthSecret()`).
 *
 * Returns the *pre-URL-encoding* signed value — hand this straight to
 * `reply.setCookie()`; `@fastify/cookie` URL-encodes cookie values by default
 * (matching better-auth's own manual `encodeURIComponent` step), so encoding it here
 * too would double-encode it.
 */
export function signBetterAuthCookieValue(value: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64')
  return `${value}.${signature}`
}
