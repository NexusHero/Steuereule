import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import type { AuthErrorLike } from './authErrors'

export interface TotpSetup {
  readonly totpURI: string
  readonly backupCodes: string[]
}

export interface UseTwoFactorResult {
  readonly enable: (password: string) => Promise<TotpSetup | string>
  readonly verifyTotp: (code: string) => Promise<string | null>
  readonly verifyBackupCode: (code: string) => Promise<string | null>
  readonly disable: (password: string) => Promise<string | null>
}

/** The two-factor client surface, typed structurally. */
interface TwoFactorClientSurface {
  twoFactor: {
    enable: (input: { password: string }) => Promise<{ data?: { totpURI: string; backupCodes: string[] } | null; error: AuthErrorLike | null }>
    verifyTotp: (input: { code: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
    verifyBackupCode: (input: { code: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
    disable: (input: { password: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
  }
}

const CODE_TO_KEY: ReadonlyMap<string, string> = new Map([
  ['INVALID_CODE', 'sicherheit.errWrongCode'],
  ['INVALID_PASSWORD', 'sicherheit.errWrongPassword'],
  ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'sicherheit.errTooManyAttempts'],
  ['ACCOUNT_TEMPORARILY_LOCKED', 'sicherheit.errLocked'],
  // NR-23: the sign-in's 2FA challenge (a short-lived cookie) lapsed — not a connection problem.
  ['INVALID_TWO_FACTOR_COOKIE', 'sicherheit.errChallengeExpired'],
])

export function useTwoFactor(): UseTwoFactorResult {
  const authClient = useAuthClient() as unknown as TwoFactorClientSurface
  const { t } = useTranslation(APP_NS)

  /** An answered refusal in words (WEB-10): a known code, a 429 as "too many requests", a 5xx as ours. */
  function translate(error: AuthErrorLike | null | undefined): string {
    const code = error?.code
    const key = code === undefined ? undefined : CODE_TO_KEY.get(code)
    if (key !== undefined) return t(key)
    if (error?.status === 429) return t('apiFehler.rateLimited')
    if (error?.status !== undefined && error.status >= 500) return t('apiFehler.server')
    return t('auth.errGeneric')
  }

  async function enable(password: string): Promise<TotpSetup | string> {
    try {
      const { data, error } = await authClient.twoFactor.enable({ password })
      if (error || !data) return translate(error)
      return { totpURI: data.totpURI, backupCodes: data.backupCodes }
    } catch {
      return t('auth.errGeneric')
    }
  }

  async function verifyTotp(code: string): Promise<string | null> {
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code })
      if (error) return translate(error)
      return null
    } catch {
      return t('auth.errGeneric')
    }
  }

  /** A one-time backup code from the 2FA setup, when the authenticator app is not at hand. */
  async function verifyBackupCode(code: string): Promise<string | null> {
    try {
      const { error } = await authClient.twoFactor.verifyBackupCode({ code })
      if (error) return translate(error)
      return null
    } catch {
      return t('auth.errGeneric')
    }
  }

  async function disable(password: string): Promise<string | null> {
    try {
      const { error } = await authClient.twoFactor.disable({ password })
      if (error) return translate(error)
      return null
    } catch {
      return t('auth.errGeneric')
    }
  }

  return { enable, verifyTotp, verifyBackupCode, disable }
}
