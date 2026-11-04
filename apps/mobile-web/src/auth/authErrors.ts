export interface AuthErrorLike {
  readonly code?: string | undefined
  readonly status?: number | undefined
  readonly message?: string | undefined
}

const CODE_TO_KEY: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'errInvalidCredentials',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'errEmailTaken',
  PASSWORD_TOO_SHORT: 'errPasswordTooShort',
  PASSWORD_COMPROMISED: 'errPasswordCompromised',
  PROVIDER_NOT_FOUND: 'errGeneric',
  INVALID_OAUTH_STATE: 'errGeneric',
  INVALID_CODE: 'errGeneric',
  ACCESS_DENIED: 'errGeneric',
}

export function authErrorKey(error: AuthErrorLike | null | undefined): string {
  const code = error?.code
  const key = code === undefined ? undefined : CODE_TO_KEY[code]
  return key ?? 'errGeneric'
}
