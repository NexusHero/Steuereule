import { useTranslation } from 'react-i18next'
import { APP_NS } from '../i18n/resources'
import { useAuthClient } from './AuthClientProvider'
import type { AuthErrorLike } from './authErrors'

export interface PasskeyInfo {
  readonly id: string
  readonly name: string | null
  readonly deviceType: string
  readonly createdAt: string
}

export interface UsePasskeyResult {
  readonly list: () => Promise<PasskeyInfo[] | string>
  readonly add: (name: string) => Promise<string | null>
  readonly remove: (id: string) => Promise<string | null>
}

/** The client surface this hook actually calls, typed structurally. */
interface PasskeyClientSurface {
  passkey: {
    addPasskey: (opts: { name: string }) => Promise<{ data?: unknown | null; error: AuthErrorLike | null }>
  }
  $fetch: <T>(
    path: string,
    opts: { method: 'GET' } | { method: 'POST'; body?: unknown },
  ) => Promise<{ data?: T | null; error: AuthErrorLike | null }>
}

const CODE_TO_KEY: Record<string, string> = {
  PREVIOUSLY_REGISTERED: 'sicherheit.passkey.errAlreadyRegistered',
  REGISTRATION_CANCELLED: 'sicherheit.passkey.errCancelled',
  AUTH_CANCELLED: 'sicherheit.passkey.errCancelled',
}

export function usePasskey(): UsePasskeyResult {
  const client = useAuthClient() as unknown as PasskeyClientSurface
  const { t } = useTranslation(APP_NS)

  function translate(code: string | undefined): string {
    const key = code === undefined ? undefined : CODE_TO_KEY[code]
    return t(key ?? 'sicherheit.passkey.errGeneric')
  }

  async function list(): Promise<PasskeyInfo[] | string> {
    try {
      const { data, error } = await client.$fetch<PasskeyInfo[]>('/passkey/list-user-passkeys', { method: 'GET' })
      if (error || !data) return translate(error?.code)
      return data
    } catch {
      return t('sicherheit.passkey.errGeneric')
    }
  }

  async function add(name: string): Promise<string | null> {
    try {
      const { error } = await client.passkey.addPasskey({ name })
      if (error) return translate(error.code)
      return null
    } catch {
      return t('sicherheit.passkey.errGeneric')
    }
  }

  async function remove(id: string): Promise<string | null> {
    try {
      const { error } = await client.$fetch('/passkey/delete-passkey', { method: 'POST', body: { id } })
      if (error) return translate(error.code)
      return null
    } catch {
      return t('sicherheit.passkey.errGeneric')
    }
  }

  return { list, add, remove }
}
