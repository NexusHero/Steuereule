// REQ-007 passkey half (ticket 14) — the client seam for the security screen's passkey
// management. Wraps the `passkeyClient()` plugin's one framework-standard method
// (`authClient.passkey.addPasskey` — it drives the full browser WebAuthn ceremony through
// `@simplewebauthn/browser`) plus the plugin's two remaining HTTP routes that the plugin does NOT
// wrap as client methods (`GET /passkey/list-user-passkeys`, `POST /passkey/delete-passkey`),
// reached through `authClient.$fetch`. Mirrors useTwoFactor's shape: one place that translates
// better-auth's own error codes to `sicherheit.*` i18n keys.
//
// Honest boundary (REQ-007 register row): `addPasskey` calls `navigator.credentials.create` —
// present on web, absent on native (React Native has no `navigator.credentials`). The screen
// labels passkeys "web-only" rather than pretending the native app can register one today; native
// passkeys are follow-up work, not silently claimed here.
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
  /** Lists the signed-in account's passkeys, or a translated error string on failure. */
  readonly list: () => Promise<PasskeyInfo[] | string>
  /** Registers a passkey via the browser WebAuthn ceremony (web only), or a translated error. */
  readonly add: (name: string) => Promise<string | null>
  /** Deletes a passkey by id — session- and ownership-gated server-side, no password re-auth. */
  readonly remove: (id: string) => Promise<string | null>
}

/** The client surface this hook actually calls, typed structurally (like useTwoFactor): the
 *  client plugin's `$InferServerPlugin` is empty, so `createAuthClient`'s own inferred type does
 *  not carry `authClient.passkey.addPasskey` — the runtime object does, because the client plugin
 *  registers it. Narrow and honest: only the methods this app calls. */
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
