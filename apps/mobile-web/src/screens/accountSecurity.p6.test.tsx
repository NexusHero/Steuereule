// P6 of the beta review on the web: the states around registration, sign-in and step-up.
//   WEB-4  the account wall says „Bestätige deine E-Mail“ after a registration, no second „Konto anlegen“.
//   WEB-5  the verification link lands on „bestätigt, jetzt anmelden“, an expired one says so.
//   WEB-8  a sign-out of its own and a password change in the app.
//   WEB-50 an account without a password confirms with its passkey instead.
//   API-3  Person B is asked to agree to a year; Person A sees that it waits.
import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { http, HttpResponse } from 'msw'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { server } from '../test-msw-server'
import { AccountWallScreen } from './funnel/KontoWandScreen'
import { LoginScreen } from './LoginScreen'
import { SignOutSection } from './profile/SignOutSection'
import { ChangePasswordSection } from './security/ChangePasswordSection'
import { StepUpChoices } from '../auth/StepUpOptions'
import { PartnerYearConsent } from './master-data/PartnerYearConsent'
import { clearPendingVerification, readPendingVerification, rememberPendingVerification } from '../auth/pendingVerification'
import { renderWithQuery } from '../test-render'

const BASE_URL = 'http://localhost:3000'

function wrap(children: ReactNode) {
  return (
    <AuthClientProvider client={createAppAuthClient(BASE_URL)}>{children}</AuthClientProvider>
  )
}

beforeEach(() => clearPendingVerification())

describe('WEB-4: after a registration the wall asks to confirm the address', () => {
  it('shows „Bestätige deine E-Mail“ with the address and no second „Konto anlegen“', () => {
    rememberPendingVerification('kim@beispiel.de')
    renderWithQuery(wrap(<AccountWallScreen path="angestellte" onRegister={() => {}} onLogin={() => {}} onLater={() => {}} pendingVerificationEmail={readPendingVerification()} />))
    expect(screen.getByText('Bestätige deine E-Mail')).toBeTruthy()
    expect(screen.getByText(/kim@beispiel\.de/)).toBeTruthy()
    expect(screen.queryByText('Konto anlegen')).toBeNull()
  })

  it('offers both ways when nothing waits', () => {
    renderWithQuery(wrap(<AccountWallScreen path="angestellte" onRegister={() => {}} onLogin={() => {}} onLater={() => {}} pendingVerificationEmail={readPendingVerification()} />))
    expect(screen.queryByText('Bestätige deine E-Mail')).toBeNull()
  })
})

describe('WEB-5: the sign-in page after the verification link', () => {
  it('says the address is confirmed', () => {
    renderWithQuery(wrap(<LoginScreen onDone={() => {}} showDeviceQr={false} emailVerified />))
    expect(screen.getByTestId('email-bestaetigt')).toBeTruthy()
  })

  it('says an expired link no longer works and how to get a new one', () => {
    renderWithQuery(wrap(<LoginScreen onDone={() => {}} showDeviceQr={false} emailVerified verificationFailed />))
    expect(screen.getByTestId('email-link-abgelaufen')).toBeTruthy()
    expect(screen.queryByTestId('email-bestaetigt')).toBeNull()
  })
})

describe('WEB-8: sign out and change the password in the app', () => {
  it('signs out with its own button', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-out`, () => HttpResponse.json({ success: true })))
    let signedOut = false
    renderWithQuery(wrap(<SignOutSection onSignedOut={() => (signedOut = true)} />))
    fireEvent.click(screen.getByTestId('profil-abmelden'))
    await waitFor(() => expect(signedOut).toBe(true))
  })

  it('says when signing out failed, and stays', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-out`, () => HttpResponse.json({}, { status: 500 })))
    let signedOut = false
    renderWithQuery(wrap(<SignOutSection onSignedOut={() => (signedOut = true)} />))
    fireEvent.click(screen.getByTestId('profil-abmelden'))
    expect(await screen.findByText(/Das Abmelden hat nicht geklappt/)).toBeTruthy()
    expect(signedOut).toBe(false)
  })

  it('changes the password with the current one and always ends the other sessions', async () => {
    let body: unknown = null
    server.use(
      http.get(`${BASE_URL}/api/auth/list-accounts`, () => HttpResponse.json([{ providerId: 'credential' }])),
      http.post(`${BASE_URL}/api/auth/change-password`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ token: null })
      }),
    )
    renderWithQuery(wrap(<ChangePasswordSection />))
    fireEvent.change(await screen.findByTestId('passwort-aktuell'), { target: { value: 'old-password-123' } })
    fireEvent.change(screen.getByTestId('passwort-neu'), { target: { value: 'a-new-password-456' } })
    fireEvent.change(screen.getByTestId('passwort-wiederholen'), { target: { value: 'a-new-password-456' } })
    fireEvent.click(screen.getByTestId('passwort-aendern-speichern'))
    expect(await screen.findByTestId('passwort-geaendert')).toBeTruthy()
    expect(body).toEqual({ currentPassword: 'old-password-123', newPassword: 'a-new-password-456', revokeOtherSessions: true })
  })

  it('is not offered to an account without a password', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-accounts`, () => HttpResponse.json([{ providerId: 'google' }])))
    renderWithQuery(wrap(<ChangePasswordSection />))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('passwort-aendern')).toBeNull()
  })
})

describe('WEB-50: an account without a password confirms without one', () => {
  it('hides the password field and offers the passkey and the provider', async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/list-accounts`, () => HttpResponse.json([{ providerId: 'google' }])),
      http.get(`${BASE_URL}/api/auth/passkey/list-user-passkeys`, () => HttpResponse.json([{ id: 'pk1' }])),
    )
    renderWithQuery(wrap(<StepUpChoices onConfirmed={() => {}} testID="probe"><span>password-field</span></StepUpChoices>))
    expect(await screen.findByTestId('probe-passkey')).toBeTruthy()
    expect(screen.getByTestId('probe-google')).toBeTruthy()
    expect(screen.queryByText('password-field')).toBeNull()
  })

  it('keeps the password for an account that has one', async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/list-accounts`, () => HttpResponse.json([{ providerId: 'credential' }])),
      http.get(`${BASE_URL}/api/auth/passkey/list-user-passkeys`, () => HttpResponse.json([])),
    )
    renderWithQuery(wrap(<StepUpChoices onConfirmed={() => {}} testID="probe"><span>password-field</span></StepUpChoices>))
    expect(await screen.findByText('password-field')).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByTestId('probe-passkey')).toBeNull()
  })
})

describe('API-3: the year waits for Person B', () => {
  it('Person B is asked and agrees', async () => {
    let agreed = false
    server.use(
      http.post(`${BASE_URL}/v1/steuerjahre/2026/kopplung/zustimmung`, () => {
        agreed = true
        return HttpResponse.json({ filingType: 'zusammen', personBConsentPending: false, consentRequestedFromMe: false })
      }),
    )
    renderWithQuery(wrap(<PartnerYearConsent taxYear={2026} current={{ filingType: 'zusammen', personBConsentPending: true, consentRequestedFromMe: true }} onChanged={() => {}} />))
    fireEvent.click(screen.getByTestId('kopplung-zustimmen'))
    await waitFor(() => expect(agreed).toBe(true))
  })

  it('a stale session first asks for the step-up', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/steuerjahre/2026/kopplung/zustimmung`, () => HttpResponse.json({ code: 'FRESH_AUTH_REQUIRED', message: 'x' }, { status: 400 })),
      http.get(`${BASE_URL}/api/auth/list-accounts`, () => HttpResponse.json([{ providerId: 'credential' }])),
      http.get(`${BASE_URL}/api/auth/passkey/list-user-passkeys`, () => HttpResponse.json([])),
    )
    renderWithQuery(wrap(<PartnerYearConsent taxYear={2026} current={{ filingType: 'zusammen', personBConsentPending: true, consentRequestedFromMe: true }} onChanged={() => {}} />))
    fireEvent.click(screen.getByTestId('kopplung-zustimmen'))
    expect(await screen.findByTestId('kopplung-zustimmung-stepup')).toBeTruthy()
  })

  it('Person A sees that the year waits', () => {
    renderWithQuery(wrap(<PartnerYearConsent taxYear={2026} current={{ filingType: 'zusammen', personBConsentPending: true, consentRequestedFromMe: false }} onChanged={() => {}} />))
    expect(screen.getByTestId('kopplung-zustimmung-ausstehend')).toBeTruthy()
  })
})
