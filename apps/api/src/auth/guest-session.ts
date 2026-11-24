import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const ALGORITHM = 'sha256'
const DEV_ONLY_FALLBACK_SECRET = 'dev-only-insecure-guest-session-secret-do-not-use-in-production'

export function signGuestSession(userId: string, secret: string): string {
  const signature = createHmac(ALGORITHM, secret).update(userId).digest('hex')
  return `${userId}.${signature}`
}

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

export function newGuestUserId(): string {
  return randomUUID()
}

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
