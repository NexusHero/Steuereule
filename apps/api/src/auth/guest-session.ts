// The trust seam for userId (ADR-0007 phase 1: guest session, before Keycloak).
// Pure sign/verify logic — no I/O, no Nest — so it is trivially unit-testable and so
// the guard (which does the I/O: reading/writing the cookie) stays a thin wrapper.
//
// A guest userId is never trusted from anything the client can set directly (no
// plaintext X-User-Id header, no body/query param). Instead the server mints an
// opaque, HMAC-signed token (`<uuid>.<hex-hmac>`) and hands it back as an httpOnly
// cookie; only a token bearing a valid signature for our secret is accepted back.
// This is the seam ADR-0007 will later swap for verified Keycloak JWTs without any
// controller/service change — only UserContextGuard and this module are touched.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'sha256'
const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-guest-session-secret-do-not-use-in-production'

/** Signs a guest userId into an opaque session token. */
export function signGuestSession(userId: string, secret: string): string {
  const signature = createHmac(ALGORITHM, secret).update(userId).digest('hex')
  return `${userId}.${signature}`
}

/**
 * Verifies a token minted by signGuestSession. Returns the userId if (and only if)
 * the signature matches for the given secret; returns undefined for anything
 * malformed, tampered, or signed under a different secret — never throws, callers
 * always fall back to minting a fresh session.
 */
export function verifyGuestSession(token: string, secret: string): string | undefined {
  const separatorIndex = token.lastIndexOf('.')
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return undefined

  const userId = token.slice(0, separatorIndex)
  const providedSignature = token.slice(separatorIndex + 1)
  const expectedSignature = createHmac(ALGORITHM, secret).update(userId).digest('hex')

  const expectedBuffer = Buffer.from(expectedSignature, 'hex')
  const providedBuffer = Buffer.from(providedSignature, 'hex')
  if (expectedBuffer.length !== providedBuffer.length) return undefined
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return undefined

  return userId
}

/** Mints a fresh, unlinkable guest userId. */
export function newGuestUserId(): string {
  return randomUUID()
}

/**
 * Resolves the signing secret. Production must set GUEST_SESSION_SECRET explicitly
 * (12-Factor III) — refusing to start with a guessable default is the whole point of
 * the seam. Dev/test get a fixed, clearly-marked fallback so the stack runs without
 * extra setup; it must never be reachable in production.
 */
export function resolveGuestSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.GUEST_SESSION_SECRET
  if (secret && secret.length > 0) return secret
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'GUEST_SESSION_SECRET must be set in production — refusing to mint guest sessions ' +
        'under a guessable default secret (ADR-0007).',
    )
  }
  return DEV_ONLY_FALLBACK_SECRET
}
