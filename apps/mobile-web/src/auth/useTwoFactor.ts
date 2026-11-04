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
  readonly disable: (password: string) => Promise<string | null>
}

/** The two-factor client surface, typed structurally. */
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
