// REQ-007 — the two-factor client seam. Wraps the `twoFactorClient()` plugin's
// `authClient.twoFactor.*` methods the security screen drives (enable → code-confirm,
// disable with re-authentication) and translates better-auth's own error codes to the
// app's `sicherheit.*` i18n keys — one place, so the screen and the login prompt never
// re-derive the mapping. The plugin's own HTTP routes carry a per-route rate limit
// (window 10s / max 3), so a rapid wrong-code retry resolves to a 429 here — mapped to
// the honest "too many attempts" message rather than a raw server string.
import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import type { AuthErrorLike } from './authErrors'

export interface TotpSetup {
  readonly totpURI: string
  readonly backupCodes: string[]
}

export interface UseTwoFactorResult {
  /** Starts enrollment — returns the TOTP URI + backup codes on success, or a translated error. */
  readonly enable: (password: string) => Promise<TotpSetup | string>
  /** Confirms one generated code, completing enrollment (or a login challenge). */
  readonly verifyTotp: (code: string) => Promise<string | null>
  /** Removes the factor — better-auth requires the password on the server (re-authentication). */
  readonly disable: (password: string) => Promise<string | null>
}

/** The two-factor client surface, typed structurally (see the cast in `useTwoFactor`): the
 *  client plugin's `$InferServerPlugin` is empty, so `createAuthClient`'s own inferred type
 *  does not carry `authClient.twoFactor.*` — the runtime object does, because the client plugin
 *  registers the `/two-factor/*` path methods. Narrow and honest: only the three methods this
 *  app actually calls. */
interface TwoFactorClientSurface {
  twoFactor: {
    enable: (input: { password: string }) => Promise<{ data?: { totpURI: string; backupCodes: string[] } | null; error: AuthErrorLike | null }>
    verifyTotp: (input: { code: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
    disable: (input: { password: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
  }
}

const CODE_TO_KEY: Record<string, string> = {
  INVALID_CODE: 'sicherheit.errWrongCode',
  INVALID_PASSWORD: 'sicherheit.errWrongPassword',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'sicherheit.errTooManyAttempts',
  ACCOUNT_TEMPORARILY_LOCKED: 'sicherheit.errLocked',
}

export function useTwoFactor(): UseTwoFactorResult {
  const authClient = useAuthClient() as unknown as TwoFactorClientSurface
  const { t } = useTranslation(APP_NS)

  function translate(code: string | undefined): string {
    const key = code === undefined ? undefined : CODE_TO_KEY[code]
    return t(key ?? 'auth.errGeneric')
  }

  async function enable(password: string): Promise<TotpSetup | string> {
    try {
      const { data, error } = await authClient.twoFactor.enable({ password })
      if (error || !data) return translate(error?.code)
      return { totpURI: data.totpURI, backupCodes: data.backupCodes }
    } catch {
      return t('auth.errGeneric')
    }
  }

  async function verifyTotp(code: string): Promise<string | null> {
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code })
      if (error) return translate(error.code)
      return null
    } catch {
      return t('auth.errGeneric')
    }
  }

  async function disable(password: string): Promise<string | null> {
    try {
      const { error } = await authClient.twoFactor.disable({ password })
      if (error) return translate(error.code)
      return null
    } catch {
      return t('auth.errGeneric')
    }
  }

  return { enable, verifyTotp, disable }
}
