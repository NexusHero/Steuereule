// Maps better-auth's own error codes (fixed by the library/server, ADR-0012 §5) to the app's
// `auth.*` i18n keys — the single place this translation happens, so Login and Registrierung
// never invent their own copy per status code. An unrecognized or absent code (including a
// genuine network failure, which carries no `code` at all) always falls back to the honest
// generic key rather than guessing or leaking a raw server string to the UI.
export interface AuthErrorLike {
  readonly code?: string | undefined
  readonly status?: number | undefined
  readonly message?: string | undefined
}

const CODE_TO_KEY: Record<string, string> = {
  // better-auth sign-in/email (dist/api/routes/sign-in.mjs) — wrong email or password.
  INVALID_EMAIL_OR_PASSWORD: 'errInvalidCredentials',
  // better-auth sign-up/email — the email already has an account.
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'errEmailTaken',
  // better-auth's password-policy check (min length).
  PASSWORD_TOO_SHORT: 'errPasswordTooShort',
  // better-auth's Have I Been Pwned plugin (REQ-010) — a confirmed breach match rejects.
  PASSWORD_COMPROMISED: 'errPasswordCompromised',
}

export function authErrorKey(error: AuthErrorLike | null | undefined): string {
  const code = error?.code
  const key = code === undefined ? undefined : CODE_TO_KEY[code]
  return key ?? 'errGeneric'
}
