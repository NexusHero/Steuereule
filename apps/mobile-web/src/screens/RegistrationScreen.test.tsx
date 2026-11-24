import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse, delay } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server, CAPABILITIES_WITH_GOOGLE, CAPABILITIES_WITHOUT_SOCIAL } from '../test-msw-server'
import { getAuthCapabilitiesControllerGetCapabilitiesMockHandler } from '@steuereule/api-client/msw'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { RegistrationScreen } from './RegistrationScreen'

const BASE_URL = 'http://localhost:3000'

function renderRegistration(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={authClient}>
          <RegistrationScreen onDone={opts.onDone ?? (() => {})} />
        </AuthClientProvider>
      </ThemeProvider>
    </I18nextProvider>
    </QueryClientProvider>,
  )
}

function fillCredentials(email = 'neu@beispiel.de', password = 'geheim-123-lang') {
  fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Mindestens 12 Zeichen'), { target: { value: password } })
}

/** Sign-up answers without a session, for a new and for a taken address alike (ADR-0109). */
function unverifiedSignUp() {
  return http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
    HttpResponse.json({ token: null, user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
  )
}

describe('RegistrierungScreen', () => {
  it('renders the German "create account" form by default', () => {
    renderRegistration()
    expect(screen.getByText('Konto anlegen')).toBeTruthy()
    expect(screen.getByText('Mit dem Anlegen akzeptierst du AGB & Datenschutz.')).toBeTruthy()
  })

  it('switches to English (ADR-0006)', () => {
    renderRegistration({ lng: 'en' })
    expect(screen.getByText('Create account')).toBeTruthy()
  })

  // Same class as Musti's #298 review F8 (LoginScreen's wordmark/greeting), found here on
  // re-check rather than assumed absent: the DS reference (`Registrierung.jsx:55`) renders
  // this page's title as a real `<h1>`; this screen's own title was visual only. Standing
  // assertion, not a one-off DOM check — drops red if `role`/`aria-level` regress.
  it('gives the form title real heading semantics, not just visual size (#298 F8 class)', () => {
    renderRegistration()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Leg dein Konto an.')
  })

  // REQ-008 — Google social sign-in is now live. The button renders on Registrierung too.
  // Apple sign-in (#45) remains hidden (backlog-gated).
  it('renders the Google social sign-in button (REQ-008)', async () => {
    renderRegistration()
    expect(await screen.findByText('Weiter mit Google')).toBeTruthy()
  })

  it('does not render the Apple social button (REQ-008b, backlog-gated)', () => {
    renderRegistration()
    expect(screen.queryByText(/Apple/)).toBeNull()
  })

  it('renders the "or with email" divider (DS auth.html)', async () => {
    renderRegistration()
    expect(await screen.findByText('oder mit E-Mail')).toBeTruthy()
  })

  // Honesty rule: "Passwort vergessen?" still has no real flow behind it
  it('does not render a dead "forgot password" affordance', () => {
    renderRegistration()
    expect(screen.queryByText('Passwort vergessen?')).toBeNull()
    expect(screen.queryByText('Forgot password?')).toBeNull()
  })

  it('shows an email error for an invalid address', () => {
    renderRegistration()
    fireEvent.click(screen.getByText('Konto anlegen'))
    expect(screen.getByText('Das sieht noch nicht nach einer E-Mail aus.')).toBeTruthy()
  })

  it('shows a password error once the email is valid but the password is short', () => {
    renderRegistration()
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.click(screen.getByText('Konto anlegen'))
    expect(screen.getByText('Mindestens 12 Zeichen fürs Passwort.')).toBeTruthy()
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
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Schau in dein Postfach.')
    expect(receivedBody).toMatchObject({ email: 'neu@beispiel.de', password: 'geheim-123-lang' })
  })

  it('shows the honest generic error on a genuine network failure (not just a server-returned error)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-up/email`, () => HttpResponse.error()))
    const onDone = vi.fn()
    renderRegistration({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.queryByText('Schau in dein Postfach.')).toBeNull()
  })

  it('shows no short-password error for a 12 character password, and one for 11', () => {
    renderRegistration()
    fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'a@b.de' } })
    fireEvent.change(screen.getByPlaceholderText('Mindestens 12 Zeichen'), { target: { value: 'x'.repeat(11) } })
    fireEvent.click(screen.getByText('Konto anlegen'))
    expect(screen.getByText('Mindestens 12 Zeichen fürs Passwort.')).toBeTruthy()
  })

  it('shows an honest inline error when the password is a known breach (better-auth PASSWORD_COMPROMISED, REQ-010)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ code: 'PASSWORD_COMPROMISED', message: 'breached' }, { status: 400 }),
      ),
    )
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    expect(await screen.findByText('Dieses Passwort ist in einem bekannten Datenleck aufgetaucht — wähl bitte ein anderes.')).toBeTruthy()
  })

  // ADR-0109 — sign-up answers a new and a taken address alike and returns no session: the success step says
  // only that a mail is on its way, and never claims the account is ready.
  it('says a mail is on its way and that the guest carries on, without claiming the account is ready', async () => {
    server.use(unverifiedSignUp())
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Schau in dein Postfach.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()
    expect(screen.getByText(/Wir haben eine E-Mail an neu@beispiel.de geschickt/)).toBeTruthy()
    expect(screen.getByText(/machst du als Gast weiter/)).toBeTruthy()
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
    expect(screen.queryByText('Willkommen bei SteuerEule.')).toBeNull()
  })

  // Live, never a snapshot: once a session for THIS address reports it verified (signed in on another tab after
  // following the link), the banner turns verified. The signed-out guest never sees it, so a taken address
  // shows nothing different (ADR-0109).
  it('turns the banner verified once the session of this address reports it verified', async () => {
    let signedIn = false
    server.use(
      unverifiedSignUp(),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json(
          signedIn ? { user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' }, session: { id: 's1', createdAt: new Date().toISOString() } } : null,
        ),
      ),
    )
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))
    await screen.findByText('Schau in dein Postfach.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()

    signedIn = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
  })

  it('does not turn verified for a session of a different account', async () => {
    server.use(
      unverifiedSignUp(),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({ user: { id: 'u2', email: 'jemand-anderes@beispiel.de', emailVerified: true, name: '' }, session: { id: 's2', createdAt: new Date().toISOString() } }),
      ),
    )
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))
    await screen.findByText('Schau in dein Postfach.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
  })

  it('shows the same success step when the server answers for a taken address (no session, no error)', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: null, user: { id: 'other-id', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
    )
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Schau in dein Postfach.')
    expect(screen.queryByText('Für diese E-Mail gibt es schon ein Konto.')).toBeNull()
  })

  it('gives the success-step heading real heading semantics too (#298 F8 class)', async () => {
    server.use(unverifiedSignUp())
    renderRegistration()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Schau in dein Postfach.')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Schau in dein Postfach.')
  })

  it('continues to onboarding as a guest via onDone from the success step CTA', async () => {
    server.use(unverifiedSignUp())
    const onDone = vi.fn()
    renderRegistration({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Schau in dein Postfach.')
    fireEvent.click(screen.getByText('Weiter zum Onboarding →'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  // REQ-008 — the honesty gate. Social credentials are server-side, so an unconfigured
  // deployment (local dev, CI, a fresh server, staging before setup) would otherwise render
  // a Google button whose every press ends in "provider not found". The capability probe
  // says what this deployment can actually do, and the screen offers nothing it cannot.
  //
  // #283 §3(a) — a confirmed "not configured" answer is no longer silence: the DS's own honest
  // fallback (auth.html) takes the button's place, and the divider stays (there is still content
  // in that slot to separate the email form from).
  it('shows the DS honest fallback instead of the Google button when the deployment has no social provider configured (#283)', async () => {
    server.use(getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITHOUT_SOCIAL))
    renderRegistration()

    // Email sign-in is unaffected — it always works, so it proves the screen rendered.
    await screen.findByPlaceholderText('du@beispiel.de')
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
    expect(await screen.findByText('Google ist auf diesem Gerät nicht eingerichtet — die anderen Wege stehen dir offen.')).toBeTruthy()
    // The fallback notice takes the button's place — the divider still has content above it.
    expect(screen.queryByText('oder mit E-Mail')).not.toBeNull()
  })

  it('does not offer Google sign-in while the capability probe is still unanswered', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/auth/capabilities`, async () => {
        await delay('infinite')
        return HttpResponse.json(CAPABILITIES_WITH_GOOGLE)
      }),
    )
    renderRegistration()

    await screen.findByPlaceholderText('du@beispiel.de')
    // Rendering the button first and removing it on the answer would flicker; staying
    // silent until the deployment confirms it is the honest default.
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
  })

  // #283 §3(a) — the widened `SocialAvailability` on both call sites: a genuinely failed probe
  // ('unknown') must render neither the button nor the DS's 'not-configured' fallback here —
  // Registrierung has no shared-outage banner of its own (that's LoginScreen-specific, §3(c)),
  // so 'unknown' stays silent regardless of whether it's still in flight or has actually failed.
  it('renders neither the Google button nor the not-configured fallback when the capability probe itself fails (#283)', async () => {
    server.use(http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.error()))
    renderRegistration()

    await screen.findByPlaceholderText('du@beispiel.de')
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
    expect(screen.queryByText('Google ist auf diesem Gerät nicht eingerichtet — die anderen Wege stehen dir offen.')).toBeNull()
  })
})
