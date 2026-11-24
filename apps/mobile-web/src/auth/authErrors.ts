export interface AuthErrorLike {
  readonly code?: string | undefined
  readonly status?: number | undefined
  readonly message?: string | undefined
}

/**
 * better-auth error codes to message keys. A Map, not an object: a code from the prototype
 * („toString“) must not find an entry, and the codes are values, not names (Sonar S2068 read
 * INVALID_EMAIL_OR_PASSWORD as a hard-coded password).
 */
const CODE_TO_KEY: ReadonlyMap<string, string> = new Map([
  ['INVALID_EMAIL_OR_PASSWORD', 'errInvalidCredentials'],
  ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', 'errEmailTaken'],
  ['PASSWORD_TOO_SHORT', 'errPasswordTooShort'],
  ['PASSWORD_COMPROMISED', 'errPasswordCompromised'],
  ['PROVIDER_NOT_FOUND', 'errGeneric'],
  ['INVALID_OAUTH_STATE', 'errGeneric'],
  ['INVALID_CODE', 'errGeneric'],
  ['ACCESS_DENIED', 'errGeneric'],
  // Per-account sign-in limit (ADR-0106 D9).
  ['SIGN_IN_ATTEMPTS_EXCEEDED', 'errTooManyAttempts'],
  // Sign-in needs a verified address (ADR-0109); the server has just sent a new link.
  ['EMAIL_NOT_VERIFIED', 'errEmailNotVerified'],
])

export function authErrorKey(error: AuthErrorLike | null | undefined): string {
  const code = error?.code
  const key = code === undefined ? undefined : CODE_TO_KEY.get(code)
  // better-auth's own per-address limiter answers 429 without a code.
  if (key === undefined && error?.status === 429) return 'errTooManyAttempts'
  return key ?? 'errGeneric'
}
