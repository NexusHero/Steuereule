import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse, delay } from 'msw'
import { AccessibilityInfo } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { server, CAPABILITIES_WITH_GOOGLE, CAPABILITIES_WITHOUT_SOCIAL, DEVICE_CODE_RESPONSE } from '../test-msw-server'
import { getAuthCapabilitiesControllerGetCapabilitiesMockHandler } from '@steuereule/api-client/msw'
import { createAppI18n } from '../i18n/app-i18n'
import { createAppAuthClient } from '../auth/auth-client'
import { AuthClientProvider } from '../auth/AuthClientProvider'
import { LoginScreen } from './LoginScreen'

const BASE_URL = 'http://localhost:3000'

// `useBreakpoint` reads react-native-web's `Dimensions`, which reads
// `document.documentElement.clientWidth` (jsdom default: 0, i.e. breakpoint `s`) and only
// re-reads on a real `resize` event — setting the property alone is not enough once
// `Dimensions` has already initialised once in this worker.
function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  // Resets any width a previous test in this file set, *before* this test renders anything —
  // not in `afterEach`, which would dispatch the `resize` event right as RTL's own `cleanup()`
  // is tearing the previous test's tree down, and land on whichever side of that race lost (an
  // `act()` warning from a `useWindowDimensions` subscriber updating an unmounting component).
  setViewportWidth(0)
  // The QR column's owl (#238, `useOwlEntranceAnimation`) queries the real
  // `AccessibilityInfo.isReduceMotionEnabled()` otherwise, which resolves on a later tick than
  // this file's assertions — an `act()` warning, not a real bug (SplashScreen.test.tsx mocks
  // the same query for the same reason). Nothing in this file asserts on the entrance itself.
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderLogin(
  opts: { lng?: 'de' | 'en'; onDone?: () => void; onGuest?: () => void; onRegister?: () => void } = {},
) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
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
    </I18nextProvider>
    </QueryClientProvider>,
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
  it('renders the Google social sign-in button (REQ-008, DS auth.html ghost variant)', async () => {
    renderLogin()
    expect(await screen.findByText('Weiter mit Google')).toBeTruthy()
  })

  it('does not render the Apple social button (REQ-008b, backlog-gated until iOS build)', () => {
    renderLogin()
    expect(screen.queryByText(/Apple/)).toBeNull()
  })

  it('renders the "or with email" divider between social and email form (DS auth.html)', async () => {
    renderLogin()
    expect(await screen.findByText('oder mit E-Mail')).toBeTruthy()
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

  // Musti's #217 T1: mirrors RegistrierungScreen.test.tsx's four verified-flip tests via the
  // shared useEmailVerified hook (#194/#217, ADR-0012 amendment). The stakeholder's (b) ruling
  // on #217: the banner becomes a confirmation, the user taps the existing continue button —
  // no auto-navigate.
  it('shows the verified confirmation on the unverified stage when the session reports the account already verified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.de', emailVerified: true, name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
    // (b), not (a): the confirmation is shown, but the app doesn't navigate on its own.
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Weiter'))
    expect(onDone).toHaveBeenCalledOnce()
  })

  // Musti's T1: a stale or different account's verified session on the shared atom is a routine
  // path here, not a race — LoginScreen is where a second person on a shared device signs in.
  // Comparator must be `sessionData.user.email === stage.email` (the server value), never `mail`.
  it('does not show the verified confirmation when the session belongs to a different account', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u2', email: 'jemand-anderes@beispiel.de', emailVerified: true, name: '' },
          session: { id: 's2', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
  })

  // #217 — the actual regression, narrower sibling of #194: `stage` used to snapshot
  // `emailVerified` once at sign-in and never re-read it, so this tab never learned that
  // verification had genuinely completed out of band (mail client, possibly a different
  // device) unless the user reloaded. Confirmed red against pre-#217 code by running this
  // test before the fix landed — not assumed. Same visibilitychange mechanism as #194's
  // RegistrierungScreen test (auth-client.ts's `refetchOnWindowFocus`).
  it('clears the unverified banner without a reload once the session reports verification (out-of-band verify, #217)', async () => {
    let verified = false
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.de', emailVerified: verified, name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')

    // The verification itself happened elsewhere (mail client / another device) — nothing on
    // this tab caused it. Only the tab regaining focus/visibility should make it notice.
    verified = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Bitte bestätige noch deine E-Mail.')).toBeNull()
  })

  // Fail-closed (#194/#217): a session-fetch error must never be read as "verified".
  // better-auth's atom keeps whatever `data` it last had on a non-401 error rather than clearing
  // it (session-atom.mjs) — here there never was a successful load, so `data` stays `null`
  // throughout; the banner must still show rather than defaulting open on the missing answer.
  // Note (Musti's #217 review): this fixture alone kills nothing — with `data` null the
  // account-scoping clause already returns false first, so a genuinely fail-open hook
  // (`emailVerified !== false`) would pass this test too. The next test below is what actually
  // exercises the fail-closed clause; keep this one anyway, it's cheap and locks the no-data path.
  it('keeps the unverified banner when the session fetch fails, rather than assuming verified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
  })

  // Fail-closed, the load-bearing case (Musti's #217 review): a session that loads
  // *successfully for this account* but doesn't positively answer — `user.email` matches,
  // `emailVerified` absent — is the shape a partial or errored read actually leaves behind, and
  // it's the case the hook's own fail-closed comment claims to guard. Verified in review both
  // directions: fails on a fail-open mutant (`emailVerified !== false`), passes on this hook.
  it('keeps the unverified banner when the session for this account never positively answers emailVerified', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.de', name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Bitte bestätige noch deine E-Mail.')
    expect(screen.queryByText('E-Mail bestätigt ✓')).toBeNull()
  })

  // The resend affordance disappears with the banner it lives in, mirroring RegistrierungScreen's
  // success stage — once verified, there's nothing left to resend.
  it('drops the resend affordance once the verified confirmation replaces the banner', async () => {
    server.use(
      http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
        HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'a@b.de', emailVerified: false, name: '' } }),
      ),
      http.get(`${BASE_URL}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'a@b.de', emailVerified: true, name: '' },
          session: { id: 's1', createdAt: new Date().toISOString() },
        }),
      ),
    )
    renderLogin()
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('E-Mail bestätigt ✓')
    expect(screen.queryByText('Mail erneut senden')).toBeNull()
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
    fireEvent.click(await screen.findByText('Weiter mit Google'))

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
    fireEvent.click(await screen.findByText('Weiter mit Google'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
  })

  it('shows an honest error when Google social sign-in fails (network failure)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-in/social`, () => HttpResponse.error()))
    renderLogin()
    fireEvent.click(await screen.findByText('Weiter mit Google'))

    await screen.findByText('Das hat gerade nicht geklappt. Prüf die Verbindung und versuch es noch mal.')
  })

  // REQ-008 — the honesty gate. Social credentials are server-side, so an unconfigured
  // deployment (local dev, CI, a fresh server, staging before setup) would otherwise render
  // a Google button whose every press ends in "provider not found". The capability probe
  // says what this deployment can actually do, and the screen offers nothing it cannot.
  it('does not offer Google sign-in when the deployment has no social provider configured', async () => {
    server.use(getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITHOUT_SOCIAL))
    renderLogin()

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
    renderLogin()

    await screen.findByPlaceholderText('du@beispiel.de')
    // Rendering the button first and removing it on the answer would flicker; staying
    // silent until the deployment confirms it is the honest default.
    expect(screen.queryByText('Weiter mit Google')).toBeNull()
  })

  // #238 — the QR device-login column. NexusHero's ruling: its own column next to the form,
  // present at `m`/`l`, absent at `s` (no honest use scanning a code with the same phone),
  // requested the moment the screen mounts rather than gated behind a tap.
  describe('QR device-login column (#238)', () => {
    it('does not render at the narrow (s) breakpoint, and never requests a code there', async () => {
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(320)
      renderLogin()
      await screen.findByText('Einloggen')

      expect(screen.queryByText('Mit dem Handy anmelden')).toBeNull()
      expect(requests).toBe(0)
    })

    it('renders the column and requests exactly one real code the moment the screen mounts, at the wide breakpoint', async () => {
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()

      expect(await screen.findByText('Mit dem Handy anmelden')).toBeTruthy()
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(screen.getByText(DEVICE_CODE_RESPONSE.userCode)).toBeTruthy()
      expect(requests).toBe(1)
    })

    it('shows an honest loading state before the code arrives', async () => {
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, async () => {
          await delay('infinite')
          return HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()

      expect(await screen.findByText('Code wird erzeugt …')).toBeTruthy()
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()
    })

    it('shows an honest error state on a genuine network failure, with a real way to try again', async () => {
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return requests === 1 ? HttpResponse.error() : HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Code konnte nicht erzeugt werden.')
      expect(requests).toBe(1)

      fireEvent.click(screen.getByText('Erneut versuchen'))
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(requests).toBe(2)
    })

    it('shows an honest error state when the deployment answers with something other than 201 (e.g. rate-limited)', async () => {
      server.use(http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.json({}, { status: 429 })))
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Code konnte nicht erzeugt werden.')
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()
    })

    it("marks the code expired once its lifetime elapses, and requests a genuinely new one on request, not a stale copy", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return HttpResponse.json({ ...DEVICE_CODE_RESPONSE, expiresIn: 1 }, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(requests).toBe(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await screen.findByText('Code abgelaufen.')
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()

      fireEvent.click(screen.getByText('Neuen Code anzeigen'))
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(requests).toBe(2)
      // The second code's own expiry timer is still pending (fake time) — drop it before
      // switching back to real timers so it can't fire (and update unmounted state) later.
      vi.clearAllTimers()
      vi.useRealTimers()
    })
  })
})
