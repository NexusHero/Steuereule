import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse } from 'msw'
import { server } from '../test-msw-server'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { RegistrierungScreen } from './RegistrierungScreen'

const BASE_URL = 'http://localhost:3000'

function renderRegistrierung(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={authClient}>
          <RegistrierungScreen onDone={opts.onDone ?? (() => {})} />
        </AuthClientProvider>
      </ThemeProvider>
    </I18nextProvider>,
  )
}

function fillCredentials(email = 'neu@beispiel.de', password = 'geheim1') {
  fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Mindestens 6 Zeichen'), { target: { value: password } })
}

describe('RegistrierungScreen', () => {
  it('renders the German "create account" form by default', () => {
    renderRegistrierung()
    expect(screen.getByText('Konto anlegen')).toBeTruthy()
    expect(screen.getByText('Mit dem Anlegen akzeptierst du AGB & Datenschutz.')).toBeTruthy()
  })

  it('switches to English (ADR-0006)', () => {
    renderRegistrierung({ lng: 'en' })
    expect(screen.getByText('Create account')).toBeTruthy()
  })

  // REQ-008 (Salih finding #1) — same honesty rule as LoginScreen: Google/Apple sign-in
  // (REQ-008) is out of scope for this slice, so no such affordance may render here either;
  // password reset likewise has no real flow/REQ backing it. This is a regression test, not a
  // snapshot of current absence — it fails the moment any of these three get dead-wired back in
  // before a real flow exists to back them.
  it('does not render Google/Apple sign-in or a password-reset affordance (REQ-008 out of scope this slice, ADR-0012)', () => {
    renderRegistrierung()
    expect(screen.queryByText(/Google/)).toBeNull()
    expect(screen.queryByText(/Apple/)).toBeNull()
    expect(screen.queryByText('Passwort vergessen?')).toBeNull()
    expect(screen.queryByText('Forgot password?')).toBeNull()
  })

  it('shows an email error for an invalid address', () => {
    renderRegistrierung()
    fireEvent.click(screen.getByText('Konto anlegen'))
    expect(screen.getByText('Das sieht noch nicht nach einer E-Mail aus.')).toBeTruthy()
  })

  it('shows a password error once the email is valid but the password is short', () => {
    renderRegistrierung()
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByText('Konto anlegen'))
    expect(screen.getByText('Mindestens 6 Zeichen fürs Passwort.')).toBeTruthy()
  })

  it('signs up against the real better-auth client (POST /api/auth/sign-up/email) with the entered credentials', async () => {
    let receivedBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          token: 'tok_1',
          user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' },
        })
      }),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    expect(receivedBody).toMatchObject({ email: 'neu@beispiel.de', password: 'geheim1' })
  })

  it('shows the honest generic error on a genuine network failure (not just a server-returned error)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-up/email`, () => HttpResponse.error()))
    const onDone = vi.fn()
    renderRegistrierung({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.queryByText('Willkommen bei SteuerEule.')).toBeNull()
  })

  it('shows an honest inline error when the email is already taken (better-auth USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'exists' }, { status: 422 }),
      ),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Für diese E-Mail gibt es schon ein Konto.')
    expect(screen.queryByText('Willkommen bei SteuerEule.')).toBeNull()
  })

  it('shows an honest inline error when the password is a known breach (better-auth PASSWORD_COMPROMISED, REQ-010)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ code: 'PASSWORD_COMPROMISED', message: 'breached' }, { status: 400 }),
      ),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Dieses Passwort ist in einem bekannten Datenleck aufgetaucht — wähl bitte ein anderes.')
  })

  // REQ-005 — the account works immediately; while unverified, the success step shows an honest
  // banner rather than the DS demo's plain "Konto steht ✓" implying everything (including
  // verification) is done. It must NOT block continuing to onboarding.
  it('shows the honest unverified-email banner on the success step when the new account is unverified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
    )
    const onDone = vi.fn()
    renderRegistrierung({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()
    expect(
      screen.getByText('Wir haben einen Bestätigungslink an neu@beispiel.de geschickt. Du kannst schon loslegen — bestätige, wenn du Zeit hast.'),
    ).toBeTruthy()

    fireEvent.click(screen.getByText('Weiter zum Onboarding →'))
    // `onDone` fires synchronously off this click, but under CI's parallel CPU load the
    // click->handler round trip through RN-Web's Pressable response system can land a tick later
    // than a bare synchronous `expect` allows for — `waitFor` tolerates that settle without
    // changing what's actually being asserted (still exactly one call).
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('does not show the unverified banner on the success step when better-auth reports the account already verified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' } }),
      ),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
  })

  it('lets the user resend the verification email from the success step, and shows an honest error if that fails', async () => {
    let resendCalls = 0
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
      http.post(`${BASE_URL}/api/auth/send-verification-email`, () => {
        resendCalls += 1
        return HttpResponse.error()
      }),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    fireEvent.click(screen.getByText('Mail erneut senden'))

    await screen.findByText('Das hat gerade nicht geklappt. Versuch es gleich noch mal.')
    expect(resendCalls).toBe(1)
  })

  it('completes to onboarding via onDone from the success step CTA', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' } }),
      ),
    )
    const onDone = vi.fn()
    renderRegistrierung({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    fireEvent.click(screen.getByText('Weiter zum Onboarding →'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})
