// The auth hooks against a fake auth client: every error code reaches the user as the right message,
// a thrown error never escapes, and a verified e-mail needs a signed-in session of exactly that address.
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'
import { createAppI18n } from '../i18n/app-i18n'
import { AuthClientProvider } from './AuthClientProvider'
import type { AppAuthClient } from './auth-client'
import { useTwoFactor } from './useTwoFactor'
import { usePasskey } from './usePasskey'
import { useSocialSignIn } from './useSocialSignIn'

const i18n = createAppI18n('de')

function wrapperFor(client: object) {
  return ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <AuthClientProvider client={client as unknown as AppAuthClient}>{children}</AuthClientProvider>
    </I18nextProvider>
  )
}

const GENERIC = i18n.t('auth.errGeneric', { ns: 'app' })

describe('useTwoFactor', () => {
  const twoFactor = {
    enable: vi.fn(),
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
    disable: vi.fn(),
  }
  const hook = () => renderHook(() => useTwoFactor(), { wrapper: wrapperFor({ twoFactor }) }).result.current

  it('returns the setup data to show the QR code and the backup codes', async () => {
    twoFactor.enable.mockResolvedValue({ data: { totpURI: 'otpauth://x', backupCodes: ['a', 'b'] }, error: null })
    expect(await hook().enable('pw')).toEqual({ totpURI: 'otpauth://x', backupCodes: ['a', 'b'] })
  })

  it('names a wrong password, a generic problem, and a thrown error as a message', async () => {
    twoFactor.enable.mockResolvedValue({ data: null, error: { code: 'INVALID_PASSWORD' } })
    expect(await hook().enable('pw')).toBe(i18n.t('sicherheit.errWrongPassword', { ns: 'app' }))
    twoFactor.enable.mockResolvedValue({ data: null, error: null })
    expect(await hook().enable('pw')).toBe(GENERIC)
    twoFactor.enable.mockRejectedValue(new Error('offline'))
    expect(await hook().enable('pw')).toBe(GENERIC)
  })

  it.each(['verifyTotp', 'verifyBackupCode'] as const)('%s: null on success, a message per error code, a generic one when it throws', async (method) => {
    twoFactor[method].mockResolvedValue({ error: null })
    expect(await hook()[method]('123456')).toBeNull()
    for (const [code, key] of [
      ['INVALID_CODE', 'sicherheit.errWrongCode'],
      ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'sicherheit.errTooManyAttempts'],
      ['ACCOUNT_TEMPORARILY_LOCKED', 'sicherheit.errLocked'],
    ] as const) {
      twoFactor[method].mockResolvedValue({ error: { code } })
      expect(await hook()[method]('1')).toBe(i18n.t(key, { ns: 'app' }))
    }
    twoFactor[method].mockResolvedValue({ error: { code: 'SOMETHING_NEW' } })
    expect(await hook()[method]('1')).toBe(GENERIC)
    twoFactor[method].mockRejectedValue(new Error('x'))
    expect(await hook()[method]('1')).toBe(GENERIC)
  })

  it('disable: null on success, wrong password named, thrown error generic', async () => {
    twoFactor.disable.mockResolvedValue({ error: null })
    expect(await hook().disable('pw')).toBeNull()
    twoFactor.disable.mockResolvedValue({ error: { code: 'INVALID_PASSWORD' } })
    expect(await hook().disable('pw')).toBe(i18n.t('sicherheit.errWrongPassword', { ns: 'app' }))
    twoFactor.disable.mockRejectedValue(new Error('x'))
    expect(await hook().disable('pw')).toBe(GENERIC)
  })
})

describe('usePasskey', () => {
  const client = { passkey: { addPasskey: vi.fn() }, $fetch: vi.fn() }
  const hook = () => renderHook(() => usePasskey(), { wrapper: wrapperFor(client) }).result.current
  const generic = i18n.t('sicherheit.passkey.errGeneric', { ns: 'app' })

  it('lists the passkeys, or says why it cannot', async () => {
    const keys = [{ id: '1', name: 'Laptop', deviceType: 'singleDevice', createdAt: '2026-01-01' }]
    client.$fetch.mockResolvedValue({ data: keys, error: null })
    expect(await hook().list()).toEqual(keys)
    expect(client.$fetch).toHaveBeenCalledWith('/passkey/list-user-passkeys', { method: 'GET' })
    client.$fetch.mockResolvedValue({ data: null, error: null })
    expect(await hook().list()).toBe(generic)
    client.$fetch.mockRejectedValue(new Error('x'))
    expect(await hook().list()).toBe(generic)
  })

  it('adds a passkey and names the cancelled and double registration', async () => {
    client.passkey.addPasskey.mockResolvedValue({ error: null })
    expect(await hook().add('Phone')).toBeNull()
    client.passkey.addPasskey.mockResolvedValue({ error: { code: 'PREVIOUSLY_REGISTERED' } })
    expect(await hook().add('Phone')).toBe(i18n.t('sicherheit.passkey.errAlreadyRegistered', { ns: 'app' }))
    client.passkey.addPasskey.mockResolvedValue({ error: { code: 'AUTH_CANCELLED' } })
    expect(await hook().add('Phone')).toBe(i18n.t('sicherheit.passkey.errCancelled', { ns: 'app' }))
    client.passkey.addPasskey.mockRejectedValue(new Error('x'))
    expect(await hook().add('Phone')).toBe(generic)
  })

  it('removes a passkey by id', async () => {
    client.$fetch.mockResolvedValue({ error: null })
    expect(await hook().remove('7')).toBeNull()
    expect(client.$fetch).toHaveBeenCalledWith('/passkey/delete-passkey', { method: 'POST', body: { id: '7' } })
    client.$fetch.mockResolvedValue({ error: { code: 'REGISTRATION_CANCELLED' } })
    expect(await hook().remove('7')).toBe(i18n.t('sicherheit.passkey.errCancelled', { ns: 'app' }))
    client.$fetch.mockRejectedValue(new Error('x'))
    expect(await hook().remove('7')).toBe(generic)
  })
})

describe('useSocialSignIn', () => {
  const social = vi.fn()
  const hook = () => renderHook(() => useSocialSignIn(), { wrapper: wrapperFor({ signIn: { social } }) })

  it('starts the provider flow and reports no error', async () => {
    social.mockResolvedValue({ error: null })
    const { result } = hook()
    let outcome: string | null = 'unset'
    await act(async () => {
      outcome = await result.current.signIn('google')
    })
    expect(outcome).toBeNull()
    expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/' })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('turns a provider error and a thrown error into a message, and is no longer submitting', async () => {
    const { result } = hook()
    social.mockResolvedValue({ error: { code: 'ACCESS_DENIED' } })
    let outcome: string | null = null
    await act(async () => {
      outcome = await result.current.signIn('apple')
    })
    expect(outcome).toBe(GENERIC)
    social.mockRejectedValue(new Error('x'))
    await act(async () => {
      outcome = await result.current.signIn('apple')
    })
    expect(outcome).toBe(GENERIC)
    expect(result.current.isSubmitting).toBe(false)
  })
})
