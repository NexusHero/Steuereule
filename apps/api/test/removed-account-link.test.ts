import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { removedAccountRedirect, signedVerificationEmail } from '../src/auth/removed-account-link.js'

const SECRET = 'test-secret-of-at-least-32-characters!!'
const WEB = 'https://app.example.test'

function token(claims: Record<string, unknown>, secret = SECRET, alg = 'HS256'): string {
  const head = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

const longExpired = { email: 'weg@example.test', iat: 1_700_000_000, exp: 1_700_003_600 }

/** ADR-0030 §5: the verification link of a removed account says so, instead of "expired". */
describe('removedAccountRedirect', () => {
  it('sends a link of ours whose account is gone to the sign-in page with ACCOUNT_REMOVED, however old it is', async () => {
    expect(await removedAccountRedirect({ token: token(longExpired) }, SECRET, `${WEB}/x`, async () => false)).toBe(`${WEB}/login?error=ACCOUNT_REMOVED`)
  })

  it('leaves the link to better-auth while the account exists', async () => {
    expect(await removedAccountRedirect({ token: token(longExpired) }, SECRET, WEB, async () => true)).toBeNull()
  })

  it('reads nothing from a token another key signed, a changed payload, another algorithm or an email change', () => {
    expect(signedVerificationEmail(token(longExpired, 'another-secret-of-at-least-32-chars!!'), SECRET)).toBeNull()
    const [head, , signature] = token(longExpired).split('.')
    const forged = `${head}.${Buffer.from(JSON.stringify({ email: 'x@example.test' })).toString('base64url')}.${signature}`
    expect(signedVerificationEmail(forged, SECRET)).toBeNull()
    expect(signedVerificationEmail(token(longExpired, SECRET, 'none'), SECRET)).toBeNull()
    expect(signedVerificationEmail(token({ ...longExpired, updateTo: 'neu@example.test' }), SECRET)).toBeNull()
    expect(signedVerificationEmail('kein.token', SECRET)).toBeNull()
    expect(signedVerificationEmail(token(longExpired), SECRET)).toBe('weg@example.test')
  })

  it('does nothing without a token', async () => {
    expect(await removedAccountRedirect({}, SECRET, WEB, async () => false)).toBeNull()
  })
})
