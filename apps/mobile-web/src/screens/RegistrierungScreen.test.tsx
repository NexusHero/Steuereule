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
import { RegistrierungScreen } from './RegistrierungScreen'

const BASE_URL = 'http://localhost:3000'

function renderRegistrierung(opts: { lng?: 'de' | 'en'; onDone?: () => void } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={authClient}>
          <RegistrierungScreen onDone={opts.onDone ?? (() => {})} />
        </AuthClientProvider>
      </ThemeProvider>
    </I18nextProvider>
    </QueryClientProvider>,
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

  // REQ-008 — Google social sign-in is now live. The button renders on Registrierung too.
  // Apple sign-in (#45) remains hidden (backlog-gated).
  it('renders the Google social sign-in button (REQ-008)', async () => {
    renderRegistrierung()
    expect(await screen.findByText('Weiter mit Google')).toBeTruthy()
  })

  it('does not render the Apple social button (REQ-008b, backlog-gated)', () => {
    renderRegistrierung()
    expect(screen.queryByText(/Apple/)).toBeNull()
  })

  it('renders the "or with email" divider (DS auth.html)', async () => {
    renderRegistrierung()
    expect(await screen.findByText('oder mit E-Mail')).toBeTruthy()
  })

  // Honesty rule: "Passwort vergessen?" still has no real flow behind it
  it('does not render a dead "forgot password" affordance', () => {
    renderRegistrierung()
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

  // Musti's T1: signUp.email() never actually returns `emailVerified: true` (better-auth.ts:146,
  // asserted false at req-005-email-signup.test.ts:61) — a signup response fabricating that value
  // proved nothing about the real "already verified" branch, which is driven by the session, not
  // the signup call. Drives the state through a mocked `GET /api/auth/get-session` instead (#194).
  it('shows the verified confirmation on the success step when the session reports the account already verified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
  })

  // #194 — the actual regression. `stage` used to snapshot `emailVerified` at signup and never
  // re-read it, so this tab never learned that verification had genuinely completed out of band
  // (the mail client, possibly a different device) unless the user reloaded. This must fail
  // under today's (pre-#194) code — confirmed by running it against that code directly, not
  // assumed. better-auth's session atom re-fetches on tab focus by default (auth-client.ts),
  // which subscribes `document`'s `visibilitychange` — the same event the real mail-app -> browser
  // return produces; jsdom's `visibilityState` is already `'visible'` here, and the atom's
  // internal focus-rate-limit window starts at 0, so this first dispatch always clears it.
  it('clears the unverified banner without a reload once the session reports verification (out-of-band verify, #194)', async () => {
    let verified = false
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: verified, name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()

    // The verification itself happened elsewhere (mail client / another device) — nothing on
    // this tab caused it. Only the tab regaining focus/visibility should make it notice.
    verified = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
  })

  // Fail-closed (#194, Musti's T1 F2): a session-fetch error must never be read as "verified".
  // better-auth's atom keeps whatever `data` it last had on a non-401 error rather than clearing
  // it (session-atom.mjs) — here there never was a successful load, so `data` stays `null`
  // throughout; the banner must still show rather than defaulting open on the missing answer.
  it('keeps the unverified banner when the session fetch fails, rather than assuming verified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-up/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })),
    )
    renderRegistrierung()
    fillCredentials()
    fireEvent.click(screen.getByText('Konto anlegen'))

    await screen.findByText('Willkommen bei SteuerEule.')
    expect(screen.getByText('Bitte bestätige noch deine E-Mail.')).toBeTruthy()
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
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
    // No fabricated `emailVerified: true` here (#194) — the CTA must work regardless of
    // verification state, so the honest signup response (always `false`, better-auth.ts:146)
    // is enough to prove the point without implying anything about the session.
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
    fireEvent.click(screen.getByText('Weiter zum Onboarding →'))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  // REQ-008 — the honesty gate. Social credentials are server-side, so an unconfigured
  // deployment (local dev, CI, a fresh server, staging before setup) would otherwise render
  // a Google button whose every press ends in "provider not found". The capability probe
  // says what this deployment can actually do, and the screen offers nothing it cannot.
  it('does not offer Google sign-in when the deployment has no social provider configured', async () => {
    server.use(getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITHOUT_SOCIAL))
    renderRegistrierung()

    // Email sign-in is unaffected — it always works, so it proves the screen rendered.
    await screen.findByPlaceholderText('du@beispiel.de')
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
    // With no social option above it, the divider has nothing left to divide.
    expect(screen.queryByText('oder mit E-Mail')).toBeNull()
  })

  it('does not offer Google sign-in while the capability probe is still unanswered', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/auth/capabilities`, async () => {
        await delay('infinite')
        return HttpResponse.json(CAPABILITIES_WITH_GOOGLE)
      }),
    )
    renderRegistrierung()

    await screen.findByPlaceholderText('du@beispiel.de')
    // Rendering the button first and removing it on the answer would flicker; staying
    // silent until the deployment confirms it is the honest default.
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
  })

})
