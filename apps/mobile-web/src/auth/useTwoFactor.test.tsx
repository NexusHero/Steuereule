// What the 2FA steps say when better-auth refuses (NR-23, WEB-10): an expired challenge and a 429 are not
// "Prüf die Verbindung".
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { createAppI18n } from '../i18n/app-i18n'
import { AuthClientProvider } from './AuthClientProvider'
import type { AppAuthClient } from './auth-client'
import { useTwoFactor } from './useTwoFactor'

function setup(error: { code?: string; status?: number } | null, thrown = false) {
  const answer = async () => {
    if (thrown) throw new TypeError('Failed to fetch')
    return { data: null, error }
  }
  const client = { twoFactor: { enable: answer, verifyTotp: answer, verifyBackupCode: answer, disable: answer } } as unknown as AppAuthClient
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={createAppI18n('de')}>
      <AuthClientProvider client={client}>{children}</AuthClientProvider>
    </I18nextProvider>
  )
  return renderHook(() => useTwoFactor(), { wrapper }).result.current
}

describe('useTwoFactor — refusals in words', () => {
  it('NR-23: an expired 2FA challenge says to sign in again', async () => {
    const twoFactor = setup({ code: 'INVALID_TWO_FACTOR_COOKIE', status: 401 })
    expect(await twoFactor.verifyTotp('123456')).toBe(
      'Die Abfrage des zweiten Faktors ist abgelaufen. Melde dich bitte noch einmal mit E-Mail und Passwort an.',
    )
  })

  it('WEB-10: a 429 without a code is "too many requests", a 5xx is ours', async () => {
    expect(await setup({ status: 429 }).verifyTotp('123456')).toBe('Gerade kommen zu viele Anfragen. Versuch es in ein paar Minuten noch mal.')
    expect(await setup({ status: 503 }).disable('pw')).toBe('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')
  })

  it("better-auth's own code wins over the status; another answer reads the status through the shared mapping", async () => {
    const t = createAppI18n('de').getFixedT('de', 'app')
    expect(await setup({ code: 'INVALID_CODE', status: 429 }).verifyTotp('123456')).toBe(t('sicherheit.errWrongCode'))
    expect(await setup({ status: 502 }).verifyTotp('123456')).toBe(t('apiFehler.server'))
    expect(await setup({ status: 400 }).verifyTotp('123456')).toBe(t('auth.errGeneric'))
  })

  it('only a request that got no answer blames the connection', async () => {
    expect(await setup(null, true).verifyBackupCode('abc')).toBe('Das hat nicht geklappt. Prüf die Verbindung und versuch es noch einmal.')
  })
})
