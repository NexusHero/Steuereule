import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../test-msw-server'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { LoginScreen } from './LoginScreen'

const BASE_URL = 'http://localhost:3000'

function renderLogin(
  opts: { lng?: 'de' | 'en'; onDone?: () => void; onGuest?: () => void; onRegister?: () => void } = {},
) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={authClient}>
          <LoginScreen
            onDone={opts.onDone ?? (() => {})}
            onGuest={opts.onGuest ?? (() => {})}
            onRegister={opts.onRegister ?? (() => {})}
          />
        </AuthClientProvider>
      </ThemeProvider>
    </I18nextProvider>,
  )
}

function fillCredentials(email = 'a@b.de', password = 'geheim1') {
  fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } })
}

describe('LoginScreen', () => {
  it('renders the German login by default (brand, email form, guest mode)', () => {
    renderLogin()
    expect(screen.getByText('Einloggen')).toBeTruthy()
    expect(screen.getByText('Erstmal als Gast umschauen')).toBeTruthy()
  })

  it('switches to English when the locale changes (ADR-0006)', () => {
    renderLogin({ lng: 'en' })
    expect(screen.getByText('Log in')).toBeTruthy()
    expect(screen.getByText('Look around as a guest')).toBeTruthy()
  })

  // REQ-008 — Google social sign-in is now live. The button renders and triggers the
  // better-auth social sign-in flow. Apple sign-in (#45) remains hidden (backlog-gated).
  it('renders the Google social sign-in button (REQ-008, DS auth.html ghost variant)', () => {
    renderLogin()
    expect(screen.getByText('Weiter mit Google')).toBeTruthy()
  })

  it('does not render the Apple social button (REQ-008b, backlog-gated until iOS build)', () => {
    renderLogin()
    expect(screen.queryByText(/Apple/)).toBeNull()
  })

  it('renders the "or with email" divider between social and email form (DS auth.html)', () => {
    renderLogin()
    expect(screen.getByText('oder mit E-Mail')).toBeTruthy()
  })

  // Honesty item #2 (Salih finding #1) — "Passwort vergessen?" has no real flow, no REQ-ID and
  // no DS artifact; a dead Pressable doesn't ship, so it's hidden rather than left as a no-op
  // link. Regression test: fails if a "forgot password" affordance is re-added before a real
  // reset flow exists to back it.
  it('does not render a dead "forgot password" affordance', () => {
    renderLogin()
    expect(screen.queryByText('Passwort vergessen?')).toBeNull()
    expect(screen.queryByText('Forgot password?')).toBeNull()
  })

  it('shows an email error for an invalid address', () => {
    renderLogin()
    fireEvent.click(screen.getByText('Einloggen'))
    expect(screen.getByText('Das sieht noch nicht nach einer E-Mail aus.')).toBeTruthy()
  })

  it('shows a password error once the email is valid but the password is short', () => {
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByText('Einloggen'))
    expect(screen.getByText('Mindestens 6 Zeichen fürs Passwort.')).toBeTruthy()
  })

  it('calls onGuest from the guest chip', () => {
    const onGuest = vi.fn()
    renderLogin({ onGuest })
    fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
    expect(onGuest).toHaveBeenCalledOnce()
  })

  it('calls onRegister from the real "create account" link (no longer a dead Pressable)', () => {
    const onRegister = vi.fn()
    renderLogin({ onRegister })
    fireEvent.click(screen.getByText('Neu hier? Konto anlegen'))
    expect(onRegister).toHaveBeenCalledOnce()
  })

  it('renders honest guest-mode copy that no longer claims device-only storage (de)', () => {
    renderLogin()
    expect(
      screen.getByText('Gast-Modus: deine Angaben werden sicher verschlüsselt gespeichert.'),
    ).toBeTruthy()
    expect(screen.queryByText(/nur auf diesem Gerät/)).toBeNull()
  })

  it('renders honest guest-mode copy that no longer claims device-only storage (en)', () => {
    renderLogin({ lng: 'en' })
    expect(
      screen.getByText('Guest mode: your details are saved securely, encrypted.'),
    ).toBeTruthy()
    expect(screen.queryByText(/this device only/)).toBeNull()
  })

  it('signs in against the real better-auth client (POST /api/auth/sign-in/email) with the entered credentials', async () => {
    let receivedBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({
          token: 'tok_1',
          user: { id: 'u1', email: 'a@b.de', emailVerified: true, name: '' },
        })
      }),
    )
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials('a@b.de', 'geheim1')
    fireEvent.click(screen.getByText('Einloggen'))

    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(receivedBody).toMatchObject({ email: 'a@b.de', password: 'geheim1' })
  })

  it('shows the honest, generic loading state while the sign-in request is in flight', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, async () => {
        await delay(30)
        return HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: true, name: '' } })
      }),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    expect(await screen.findByText('Wird geprüft …')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('Wird geprüft …')).toBeNull())
  })

  it('shows the honest generic error on a genuine network failure (not just a server-returned error)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-in/email`, () => HttpResponse.error()))
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows an honest inline error for wrong credentials (better-auth INVALID_EMAIL_OR_PASSWORD) and does not proceed', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, { status: 401 }),
      ),
    )
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('E-Mail oder Passwort stimmen nicht.')
    expect(onDone).not.toHaveBeenCalled()
  })

  // REQ-005 — "while unverified, the UI honestly shows a 'please verify' state without
  // blocking basic use": the account IS real and signed in, so the honest banner is shown
  // inline instead of silently claiming success; the user can still continue on their own.
  it('shows the honest unverified-email banner instead of silently continuing, when the account is unverified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
    )
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    expect(screen.getByText('Wir haben einen Bestätigungslink an a@b.de geschickt. Du kannst schon loslegen — bestätige, wenn du Zeit hast.')).toBeTruthy()
    // Doesn't block basic use — sign-in still succeeded, but onDone only fires once the user
    // acknowledges via the explicit continue action (never auto-advances past an honest banner).
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Weiter'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('lets the user resend the verification email from the unverified banner', async () => {
    let resendCalls = 0
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.post(`${BASE_URL}/api/auth/send-verification-email`, () => {
        resendCalls += 1
        return HttpResponse.json({ status: true })
      }),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    fireEvent.click(screen.getByText('Mail erneut senden'))

    await screen.findByText('Ist raus — schau in dein Postfach.')
    expect(resendCalls).toBe(1)
  })

  it('shows an honest error when resending the verification email fails', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.post(`${BASE_URL}/api/auth/send-verification-email`, () => HttpResponse.error()),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    fireEvent.click(screen.getByText('Mail erneut senden'))

    await screen.findByText('Das hat gerade nicht geklappt. Versuch es gleich noch mal.')
  })

  // REQ-008 — Google social sign-in: calls better-auth's signIn.social({ provider: 'google' })
  it('calls authClient.signIn.social with provider "google" when the Google button is pressed', async () => {
    let socialRequestBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/social`, async ({ request }) => {
        socialRequestBody = await request.json()
        // better-auth's social endpoint returns a redirect URL for the OAuth flow
        return HttpResponse.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?...' })
      }),
    )
    renderLogin()
    fireEvent.click(screen.getByText('Weiter mit Google'))

    await waitFor(() => {
      expect(socialRequestBody).toMatchObject({ provider: 'google' })
    })
  })

  it('shows an honest error when Google social sign-in fails (server error)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/social`, () =>
        HttpResponse.json({ code: 'INVALID_OAUTH_STATE', message: 'Invalid state' }, { status: 400 }),
      ),
    )
    renderLogin()
    fireEvent.click(screen.getByText('Weiter mit Google'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
  })

  it('shows an honest error when Google social sign-in fails (network failure)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-in/social`, () => HttpResponse.error()))
    renderLogin()
    fireEvent.click(screen.getByText('Weiter mit Google'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
  })
})
