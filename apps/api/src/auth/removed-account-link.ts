import { createHmac, timingSafeEqual } from 'node:crypto'

/** The `error` a verification link of an account that no longer exists lands with (ADR-0030 §5). */
export const ACCOUNT_REMOVED_ERROR = 'ACCOUNT_REMOVED'

const base64url = (input: Buffer): string => input.toString('base64url')

/**
 * The address a verification token was signed for, when the signature is ours, whatever its age. better-auth
 * checks the expiry before it looks the account up, so a link older than its lifetime (every link of an
 * account the ADR-0030 sweep removed after 30 days) would only say "expired". Only the signature counts here:
 * the result decides which notice the sign-in page shows, never access. An email-change token (`updateTo`)
 * is not a verification of a new account and gives null.
 */
export function signedVerificationEmail(token: string, secret: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts as [string, string, string]
  try {
    const head = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown }
    if (head.alg !== 'HS256') return null
    const expected = Buffer.from(base64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest()))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: unknown; updateTo?: unknown }
    if (typeof claims.email !== 'string' || claims.updateTo !== undefined) return null
    return claims.email
  } catch {
    return null
  }
}

/**
 * ADR-0030 §5: a verification link whose account was removed (never confirmed, or deleted by its owner) must not
 * end in a generic "invalid link". When the token is ours and no account holds its address any more, the link
 * lands on the web app's sign-in page with `error=ACCOUNT_REMOVED`, which says the account is gone and offers a
 * new registration. The address is built from the web app's URL, never from the link's `callbackURL`, so the
 * hook opens no redirect. Returns it, or null to let better-auth answer as usual.
 */
export async function removedAccountRedirect(
  query: { readonly token?: unknown },
  secret: string,
  webAppUrl: string,
  accountExists: (email: string) => Promise<boolean>,
): Promise<string | null> {
  if (typeof query.token !== 'string') return null
  const email = signedVerificationEmail(query.token, secret)
  if (email === null || (await accountExists(email))) return null
  return `${new URL(webAppUrl).origin}/login?error=${ACCOUNT_REMOVED_ERROR}`
}
