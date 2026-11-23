import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import type { AuthErrorLike } from './authErrors'

/** The code the API answers when an action needs a fresh sign-in or a re-entered password (ADR-0106 D2). */
export const STEP_UP_REQUIRED_CODE = 'FRESH_AUTH_REQUIRED'

export interface StepUpRequired {
  readonly stepUp: true
}

export function isStepUpRequired(value: unknown): value is StepUpRequired {
  return typeof value === 'object' && value !== null && (value as { stepUp?: unknown }).stepUp === true
}

interface StepUpClientSurface {
  $fetch: <T>(path: string, opts: { method: 'POST'; body: unknown }) => Promise<{ data?: T | null; error: AuthErrorLike | null }>
}

export interface UseStepUpResult {
  /** Re-enters the password for this session; `null` on success, else the message to show. */
  readonly verifyPassword: (password: string) => Promise<string | null>
}

export function useStepUp(): UseStepUpResult {
  const client = useAuthClient() as unknown as StepUpClientSurface
  const { t } = useTranslation(APP_NS)

  async function verifyPassword(password: string): Promise<string | null> {
    try {
      const { error } = await client.$fetch('/verify-password', { method: 'POST', body: { password } })
      if (!error) return null
      return error.code === 'INVALID_PASSWORD' ? t('sicherheit.stepUp.wrong') : t('auth.errGeneric')
    } catch {
      return t('auth.errGeneric')
    }
  }

  return { verifyPassword }
}
