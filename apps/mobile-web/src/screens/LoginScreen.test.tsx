import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { http, HttpResponse, delay } from 'msw'
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
  // #298 review, F6 — the `AccessibilityInfo.isReduceMotionEnabled()` mock this beforeEach used
  // to carry here is gone, not just its comment: #283/C3 dropped the QR column's animated owl
  // (the mock's only reason to exist in this file), and nothing else this file renders queries
  // AccessibilityInfo. Removed rather than left with a corrected comment pointing at nothing —
  // confirmed empirically, not assumed: this file's full suite runs clean without it, no new
  // `act()` warnings.
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderLogin(
  opts: {
    lng?: 'de' | 'en'
    onDone?: () => void
    onGuest?: () => void
    onRegister?: () => void
    // Embedded usage (#238 AC-7) omits both entirely, rather than passing no-ops —
    // `undefined` is what actually drives LoginScreen's own conditional rendering.
    omitGuestAndRegister?: boolean
    showDeviceQr?: boolean
  } = {},
) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const authClient = createAppAuthClient(BASE_URL)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // `exactOptionalPropertyTypes` treats `prop={undefined}` differently from omitting `prop`
  // entirely — spreading only the keys that actually apply is what genuinely omits
  // onGuest/onRegister for the embedded-usage tests, not just sets them to `undefined`.
  const optionalProps = {
    ...(opts.omitGuestAndRegister ? {} : { onGuest: opts.onGuest ?? (() => {}), onRegister: opts.onRegister ?? (() => {}) }),
    ...(opts.showDeviceQr === undefined ? {} : { showDeviceQr: opts.showDeviceQr }),
  }
  return render(
    <QueryClientProvider client={queryClient}>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider mode="light">
        <AuthClientProvider client={authClient}>
          <LoginScreen onDone={opts.onDone ?? (() => {})} {...optionalProps} />
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

  // Musti's #298 review, F8 — the wordmark (C1/C2's promoted page title) and the greeting
  // (demoted to a subheading) are a visual level-1/level-2 pair only if the DOM says so too;
  // the PR's own evidence block previously named this as a manual, one-off DOM check, not a
  // standing assertion — closed here. `getByRole('heading', { level: N })` only resolves if
  // `role="heading"`/`aria-level={N}` actually reached the rendered DOM (react-native-web's
  // own forwarding, not assumed) — dropping either prop from PageHeader turns this red.
  it('gives the wordmark and greeting real heading semantics, not just visual size (#298 F8)', () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('SteuerEule')
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Schön, dass du da bist.')
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

  // #283 AC-A — a genuine transport failure on the sign-in request now surfaces through the
  // single shared-outage alert (`login.apiUnreachable.*`), not a duplicate, form-local generic
  // string — "one cause, one message" applies here too, not just to the three-surface case.
  // #298 review, F2 — this test renders at the default (0px / `s`) viewport, where the QR column
  // never starts (`deviceQrEnabled` is false there) and so nothing is actually auto-retrying —
  // the banner must NOT claim it is. This is the exact scenario the finding was about: an
  // earlier version of this very test asserted the false claim.
  it('shows the shared outage alert on a genuine network failure, without a false auto-retry claim at the narrow breakpoint (#298 F2)', async () => {
    server.use(http.post(`${BASE_URL}/api/auth/sign-in/email`, () => HttpResponse.error()))
    const onDone = vi.fn()
    renderLogin({ onDone })
    fillCredentials()
    fireEvent.click(screen.getByText('Einloggen'))

    await screen.findByText('Gerade nicht erreichbar — das liegt an uns.')
    expect(screen.getByText('Unsere Server antworten nicht. Deine Daten sind sicher, es ist nichts verloren.')).toBeTruthy()
    expect(screen.queryByText(/Wir versuchen es automatisch weiter/)).toBeNull()
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
    // #283 AC-B — a wrong password is a real answer, not a failure: it must never be merged
    // into (or read as) the shared-outage alert.
    expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
  })

  // #308 — the partial case, which neither AC-A nor AC-B covered. AC-B holds when the API is
  // wholly reachable and AC-A when it is wholly not; in between, the QR column's health was
  // allowed to veto the login form's own message. These run at `l`, where the QR column
  // actually starts — at `s` it never mints, so the defect is unreachable there by construction,
  // which is exactly why #298's review, Salih's real-stack run and CI all missed it.
  describe('#308 — one surface being down must not swallow another surface\'s real answer', () => {
    it('renders the wrong-password message when only /v1/device/code is unreachable', async () => {
      setViewportWidth(1280)
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.error()),
        http.post(`${BASE_URL}/api/auth/sign-in/email`, () =>
          HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, { status: 401 }),
        ),
      )
      const onDone = vi.fn()
      renderLogin({ onDone })
      fillCredentials()
      fireEvent.click(screen.getByText('Einloggen'))

      // The server answered, and what it said was "wrong password". That answer must survive
      // the QR column's unrelated failure.
      await screen.findByText('E-Mail oder Passwort stimmen nicht.')
      expect(onDone).not.toHaveBeenCalled()

      // #336 review, F1 — the assertion this test was missing, and the reason the contradiction
      // survived it. Nothing checked what the BANNER said, so the suite was blind to a screen
      // claiming "Unsere Server antworten nicht" three lines above a message that is only
      // knowable because a server answered.
      expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
      expect(screen.queryByText(/Unsere Server antworten nicht/)).toBeNull()
      // The QR column still says its own honest piece — scoped to what its mint established.
      expect(screen.getByText('Code konnte nicht erzeugt werden.')).toBeTruthy()
    })

    // #336 review, F8 — the branch of AC-A nothing in this suite drove: all three surfaces down
    // and NO submit, which is the state a user is in for the first seconds on the page. AC-A's
    // "(if submitted)" is load-bearing, and narrowing `apiUnreachable` in F1 took the Google
    // slot's honest line with it — the slot vanished without trace, which #283 §3(a) calls
    // worse than fixing neither surface.
    it('keeps the Google slot\'s honest "can\'t tell" line when nothing has been submitted yet (#283 §3(a), #336 F8)', async () => {
      setViewportWidth(1280)
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.error()),
        http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.error()),
      )
      renderLogin()

      // The probe cannot answer, and says so rather than disappearing.
      expect(await screen.findByText('Wir können gerade nicht prüfen, ob Google verfügbar ist.')).toBeTruthy()

      // #336 review, F10 — and the banner IS shown, without a submit. Two independent surfaces
      // failed at transport, which is sufficient evidence of a screen-wide outage; requiring the
      // user to submit first was F10's defect, caught by `return-visit.mjs` Row B against a real
      // browser after five unit rounds missed it. AC-A's "(if submitted)" exists precisely
      // because the sign-in may not have happened.
      expect(await screen.findByText('Gerade nicht erreichbar — das liegt an uns.')).toBeTruthy()
    })

    // The other half of F10's partition, and the one F1 was right about: a single surface down
    // is NOT sufficient. Without this, the fix for F10 would simply reinstate F1's defect.
    it('makes no screen-wide claim when only the QR mint failed and the probe answered (#336 F1 must not regress)', async () => {
      setViewportWidth(1280)
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.error()),
        http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.json({ socialProviders: ['google'] }, { status: 200 })),
      )
      renderLogin()

      // The QR column speaks for itself…
      expect(await screen.findByText('Code konnte nicht erzeugt werden.')).toBeTruthy()
      // …and the screen claims nothing, because the capabilities probe answered.
      expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
      expect(screen.queryByText(/Unsere Server antworten nicht/)).toBeNull()
    })

    it('still shows the single consolidated banner when the form\'s own submit cannot reach the server (#298 must not regress)', async () => {
      setViewportWidth(1280)
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.error()),
        http.post(`${BASE_URL}/api/auth/sign-in/email`, () => HttpResponse.error()),
      )
      const onDone = vi.fn()
      renderLogin({ onDone })
      fillCredentials()
      fireEvent.click(screen.getByText('Einloggen'))

      await screen.findByText('Gerade nicht erreichbar — das liegt an uns.')
      // One cause, one message: the field's generic error stays suppressed here, because the
      // banner genuinely subsumes it — this is the case #298 consolidated, and it is unchanged.
      expect(screen.queryByText('E-Mail oder Passwort stimmen nicht.')).toBeNull()
      expect(onDone).not.toHaveBeenCalled()
    })
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
  // #283 §3(a) — a confirmed "not configured" answer is no longer silence: the DS's own honest
  // fallback (auth.html) takes the button's place, and the divider stays (there is still content
  // in that slot to separate the email form from).
  it('shows the DS honest fallback instead of the Google button when the deployment has no social provider configured (#283)', async () => {
    server.use(getAuthCapabilitiesControllerGetCapabilitiesMockHandler(CAPABILITIES_WITHOUT_SOCIAL))
    renderLogin()

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

    // #283 AC-A, as refined by #336's F1 and the stakeholder's ruling on it.
    //
    // This test used to assert the opposite of what it asserts now, and the change is deliberate
    // rather than a fixture drifting to match code. It expected the shared banner ("Gerade nicht
    // erreichbar — das liegt an uns." / "Unsere Server antworten nicht.") on a QR-only transport
    // failure, and expected `login.qr.error` to be ABSENT because the column deferred to that
    // banner.
    //
    // AC-A's "one cause, one message" is intact — what was wrong was the claim's *scope*. A
    // failed mint establishes that the mint failed; it does not establish that our servers are
    // down, and on `m`/`l` the login form is frequently working at the same moment (see the
    // #308 partial-outage tests above, where the server answers a wrong password while this
    // endpoint is dead). The banner's wording was generalised for the whole-outage case and
    // cannot be stretched to cover this one.
    //
    // So the column stops deferring and owns its own honest copy — which already existed, which
    // is why Suhay's ruling on the copy question was "no new string".
    it('shows the QR column\'s own error state on a genuine mint failure, and no screen-wide outage claim (#283 AC-A, #336 F1)', async () => {
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return requests === 1 ? HttpResponse.error() : HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Wir versuchen es automatisch erneut …')
      expect(requests).toBe(1)
      // The column names what the mint established, and nothing wider.
      expect(screen.getByText('Code konnte nicht erzeugt werden.')).toBeTruthy()
      // And the screen makes no claim about the API as a whole, because nothing here
      // established one — this is F1's defect, asserted so it cannot return.
      expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
      expect(screen.queryByText(/Unsere Server antworten nicht/)).toBeNull()

      fireEvent.click(screen.getByText('Erneut versuchen'))
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(requests).toBe(2)
      expect(screen.queryByText('Code konnte nicht erzeugt werden.')).toBeNull()
    })

    // #283 AC-B — ADR-0024's own rate limit is an answer, not a failure: distinct copy, no
    // outage banner, and (proven in the auto-retry describe block below) never an auto-retry.
    it('shows a distinct rate-limited state when the deployment answers with 429 — not the generic/outage copy (#283 AC-B)', async () => {
      server.use(http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.json({}, { status: 429 })))
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Gerade zu viele Anfragen. Versuch es in ein paar Sekunden noch mal.')
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()
      expect(screen.queryByText('Code konnte nicht erzeugt werden.')).toBeNull()
      expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
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
      // #283 AC-B — an expiry is an honest answer (a code's own lifetime ran out), never the
      // shared-outage alert.
      expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()

      fireEvent.click(screen.getByText('Neuen Code anzeigen'))
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(requests).toBe(2)
      // The second code's own expiry timer is still pending (fake time) — drop it before
      // switching back to real timers so it can't fire (and update unmounted state) later.
      vi.clearAllTimers()
      vi.useRealTimers()
    })

    // Task 6 (Salih's T1 gate): minting a code is only half of RFC 8628 — without the desktop
    // actually polling `POST /v1/device/token`, "Der andere Bildschirm meldet sich jetzt an."
    // (the phone's own approval copy, resources.ts's `device.approval.approved.body`) is false.
    // This exercises the real user-facing path a phone's tap would trigger, not the endpoint
    // directly — the same discipline Salih's own T1 script applied, per NexusHero's instruction.
    describe('polling for approval (#238 task 6, AC-5)', () => {
      it('polls POST /v1/device/token at the server-given interval and signs the desktop in once approved, never faster than that interval', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        let tokenRequests = 0
        server.use(
          http.post(`${BASE_URL}/v1/device/token`, () => {
            tokenRequests += 1
            // Approved only on the second real poll — the first must genuinely still be
            // "pending", not a synthetic always-succeeds stub, or this would prove nothing
            // about the loop actually running more than once.
            if (tokenRequests < 2) {
              return HttpResponse.json({ error: 'authorization_pending' }, { status: 400 })
            }
            return HttpResponse.json({ success: true }, { status: 200 })
          }),
        )
        const onDone = vi.fn()
        setViewportWidth(1024)
        renderLogin({ onDone })
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
        expect(tokenRequests).toBe(0)

        // DEVICE_CODE_RESPONSE's interval is 5s — well short of it (`shouldAdvanceTime`'s own
        // real-clock drift while awaiting the mint above is at most a handful of ms, nowhere
        // near enough to close a 1s margin), nothing has polled yet.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4000)
        })
        expect(tokenRequests).toBe(0)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500)
        })
        expect(tokenRequests).toBe(1)
        expect(onDone).not.toHaveBeenCalled()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5500)
        })
        expect(tokenRequests).toBe(2)
        // #283 §5, state 7 — the confirmation beat: approved is *shown*, `onDone` doesn't fire
        // in the same tick the 200 arrives.
        await screen.findByText('Das war’s — du bist drin.')
        expect(onDone).not.toHaveBeenCalled()

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1500)
        })
        expect(onDone).toHaveBeenCalledTimes(1)

        vi.clearAllTimers()
        vi.useRealTimers()
      })

      it('backs off on slow_down (RFC 8628 §3.5) instead of treating it as a failure', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        let tokenRequests = 0
        server.use(
          http.post(`${BASE_URL}/v1/device/token`, () => {
            tokenRequests += 1
            if (tokenRequests === 1) return HttpResponse.json({ error: 'slow_down' }, { status: 400 })
            return HttpResponse.json({ error: 'authorization_pending' }, { status: 400 })
          }),
        )
        setViewportWidth(1024)
        renderLogin()
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        expect(tokenRequests).toBe(1)
        // Still on the standard 5s interval — this poll must not have landed yet.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        expect(tokenRequests).toBe(1)
        // The +5s RFC 8628 back-off is what gets the next one through.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        expect(tokenRequests).toBe(2)
        // Never surfaced as an error — the QR is still the thing on screen.
        expect(screen.queryByText('Code konnte nicht erzeugt werden.')).toBeNull()

        vi.clearAllTimers()
        vi.useRealTimers()
      })

      it('shows an honest, distinct "denied" state on access_denied — not silently the generic error', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        server.use(http.post(`${BASE_URL}/v1/device/token`, () => HttpResponse.json({ error: 'access_denied' }, { status: 400 })))
        setViewportWidth(1024)
        renderLogin()
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        await screen.findByText('Anmeldung wurde nicht bestätigt.')
        expect(screen.queryByText('Code konnte nicht erzeugt werden.')).toBeNull()
        // #283 AC-B — a phone declining the code is a real answer, never the shared-outage alert.
        expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()

        vi.clearAllTimers()
        vi.useRealTimers()
      })

      // #283 AC-B — a bare 429 on the poll is ADR-0024's rate limit, not an outage: its own
      // distinct copy, and — proven here — no auto-retry at all (the mint's own auto-retry
      // effect explicitly excludes 'rate-limited', §4(1)).
      it('treats an unrecognised poll failure (e.g. a bare 429) as a distinct rate-limited state, never "still pending" and never auto-retried', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        let tokenRequests = 0
        server.use(
          http.post(`${BASE_URL}/v1/device/token`, () => {
            tokenRequests += 1
            return HttpResponse.json({ statusCode: 429, message: 'Too Many Requests' }, { status: 429 })
          }),
        )
        const onDone = vi.fn()
        setViewportWidth(1024)
        renderLogin({ onDone })
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        expect(tokenRequests).toBe(1)
        await screen.findByText('Gerade zu viele Anfragen. Versuch es in ein paar Sekunden noch mal.')
        expect(screen.queryByText('Gerade nicht erreichbar — das liegt an uns.')).toBeNull()
        expect(onDone).not.toHaveBeenCalled()

        // No further poll fires on its own — an honest error state waits for a real retry,
        // it doesn't quietly keep trying underneath a screen that says it failed. Same
        // assertion also proves the hard ADR-0024 boundary: a 429 must never auto-retry.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        expect(tokenRequests).toBe(1)

        vi.clearAllTimers()
        vi.useRealTimers()
      })

      it('stops polling once the code has expired — no further POST /v1/device/token after that', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        let tokenRequests = 0
        server.use(
          http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.json({ ...DEVICE_CODE_RESPONSE, expiresIn: 3, interval: 5 }, { status: 201 })),
          http.post(`${BASE_URL}/v1/device/token`, () => {
            tokenRequests += 1
            return HttpResponse.json({ error: 'authorization_pending' }, { status: 400 })
          }),
        )
        setViewportWidth(1024)
        renderLogin()
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

        // The 3s expiry lands before the 5s poll interval ever would.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        await screen.findByText('Code abgelaufen.')
        expect(tokenRequests).toBe(0)

        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000)
        })
        expect(tokenRequests).toBe(0)

        vi.clearAllTimers()
        vi.useRealTimers()
      })

      // Musti's #239 gate review (F3): the one poll branch nothing had exercised — and, per
      // `better-auth.ts:297`'s 2-minute `expiresIn`, the *likeliest* unhappy path a real phone
      // hits, not an exotic one. Distinct from "stops polling once the code has expired" above:
      // that test drives the *client's own* countdown reaching zero (never asked the server);
      // this one drives the server telling the client the code expired mid-poll, the RFC 8628
      // `expired_token` branch (`useDeviceQrCode.ts`'s `poll()`) — the only one of the five
      // `switch` arms with zero coverage before this.
      //
      // Correction (#298 F14, Musti's second pass) — an earlier version of this comment and test
      // built an elaborate `vi.getTimerCount()`-before/-after pairing, claiming it proved "no
      // stray timer left behind": that assertion was already structurally unable to move by the
      // time this comment was first corrected in the prior re-verification pass, and the
      // correction re-explained it in today's terms without re-proving it — a comment fix is
      // itself a claim, and this one wasn't checked against a mutant before being written. Mutated
      // and measured now, both ways, and both stayed green: removing the `expired_token` branch's
      // `stopPolling()` call entirely, and disabling the countdown interval's own `clearInterval`
      // cleanup. Two reasons, together fatal to that assertion: (1) by the time this branch runs,
      // `pollTimer` has already fired — `poll()` only ever runs *from* that timeout — so
      // `clearTimeout` on it here is a no-op regardless of whether `stopPolling()` is even called;
      // there is nothing left armed for `stopPolling()` to still catch. (2) `vi.getTimerCount()`
      // counts *pending* timers; a `setInterval` re-arms itself on every tick, so its contribution
      // to the count never changes whether or not its cleanup ever runs — an orphaned interval
      // passes this check by doing exactly what the check was looking for. The intended proof
      // ("a stray timer fires, removes itself, the count drops") only ever describes a one-shot
      // `setTimeout` — that was `expiryTimer`, and #283 deleted it. Removed rather than re-argued
      // a third time: the `getTimerCount()` pairing, its "precise proof" framing, and the "no
      // stray timer left behind" claim in this test's own name.
      //
      // What's left, and is genuinely breakable: `tokenRequests` staying at 1 through the full
      // 120s deadline. Nothing in the `expired_token` branch calls `schedulePoll(...)` again, so
      // this doesn't currently exercise `stopPolling()` specifically — but it does guard the real
      // regression of someone later treating `expired_token` as pollable (adding a `schedulePoll`
      // call there by mistake), which is exactly the shape of bug #240 cost a day on.
      it('shows the expired state and genuinely stops polling on a server-reported expired_token', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        let tokenRequests = 0
        server.use(
          http.post(`${BASE_URL}/v1/device/token`, () => {
            tokenRequests += 1
            return HttpResponse.json({ error: 'expired_token' }, { status: 400 })
          }),
        )
        setViewportWidth(1024)
        renderLogin()
        await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5000)
        })
        await screen.findByText('Code abgelaufen.')
        expect(tokenRequests).toBe(1)

        // The server-given 120s deadline passing changes nothing further: no more polls, state
        // stays exactly as it was.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(120_000)
        })
        expect(tokenRequests).toBe(1)
        await screen.findByText('Code abgelaufen.')

        vi.clearAllTimers()
        vi.useRealTimers()
      })
    })
  })

  // #283 — DS-fidelity/honesty refinement on top of #238 (Musti's refinement block, ADR-0018).
  describe('#283 — shared-outage banner (AC-A/AC-B) and the resize/countdown fixes', () => {
    // ADR-0021 — proving AC-A means proving it can actually go *wrong*: this drives all three
    // surfaces (device-code mint, capabilities probe, email sign-in) into a genuine transport
    // failure at once and checks there is exactly one alert on screen, not the union of what
    // each surface would have said on its own.
    it('AC-A: merges a genuine three-surface transport outage into exactly one alert, with the Google slot and QR column both deferring to it', async () => {
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.error()),
        http.get(`${BASE_URL}/v1/auth/capabilities`, () => HttpResponse.error()),
        http.post(`${BASE_URL}/api/auth/sign-in/email`, () => HttpResponse.error()),
      )
      setViewportWidth(1024)
      renderLogin()
      fillCredentials()
      fireEvent.click(screen.getByText('Einloggen'))

      await screen.findByText('Gerade nicht erreichbar — das liegt an uns.')
      // Exactly one — not the outage banner *plus* a separate password-field error, not a
      // second copy inside the QR column.
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      // #298 F2's other half: at THIS breakpoint the QR column really is retrying, so the
      // banner's own "we're automatically trying again" claim is true here — mirrors the
      // narrow-breakpoint test above, which is the case where it must NOT appear.
      expect(screen.getByText('Unsere Server antworten nicht. Deine Daten sind sicher, es ist nichts verloren. Wir versuchen es automatisch weiter.')).toBeTruthy()

      // The Google slot doesn't just vanish — capabilities never answered either.
      expect(screen.getByText('Wir können gerade nicht prüfen, ob Google verfügbar ist.')).toBeTruthy()
      expect(screen.queryByText('Weiter mit Google')).toBeNull()

      // The QR column defers to the shared alert (no repeated "server unreachable" prose) but
      // still says it's retrying, and still offers a manual way out.
      expect(screen.getByText('Wir versuchen es automatisch erneut …')).toBeTruthy()
      expect(screen.queryByText('Code konnte nicht erzeugt werden.')).toBeNull()
      expect(screen.getByText('Erneut versuchen')).toBeTruthy()
    })

    // The mirror image: each of AC-B's four real answers, one alert query each, proving the
    // merge doesn't ever fire on an answer even when checked directly (not just "the old copy
    // is absent" as in the tests above, but "no alert-role element at all beyond the surface's
    // own specific one").
    it('AC-B: a 429 on the mint never raises the shared alert, and offers only its own specific copy', async () => {
      server.use(http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.json({}, { status: 429 })))
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Gerade zu viele Anfragen. Versuch es in ein paar Sekunden noch mal.')
      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.textContent).not.toMatch(/nicht erreichbar/)
    })

    // #283 §4(2) — the actual regression Musti found: crossing the `s`/`m` boundary used to
    // unmount `DeviceQrColumn` (the hook lived inside it), burning a perfectly good code. The
    // state machine now lives in `LoginScreen` itself, which never unmounts on a resize.
    it('keeps a valid code across a resize below 768px and back — does not re-mint (#283 §4(2))', async () => {
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()
      await screen.findByText(DEVICE_CODE_RESPONSE.userCode)
      expect(requests).toBe(1)

      // Narrow past the `s` boundary — the column itself still has no honest use there
      // (unchanged, ADR-0014/§7), but the code underneath it must survive the round trip.
      act(() => {
        setViewportWidth(320)
      })
      await waitFor(() => expect(screen.queryByText('Mit dem Handy anmelden')).toBeNull())
      expect(requests).toBe(1)

      act(() => {
        setViewportWidth(1024)
      })
      await screen.findByText(DEVICE_CODE_RESPONSE.userCode)
      // The load-bearing assertion: still exactly one mint, not a second one from remounting.
      expect(requests).toBe(1)
    })

    // A screen that never leaves `s` must still never request a code at all — the latch itself
    // (not just the visual gating) has to stay closed when it's never had a reason to open.
    it('still never requests a code if the screen never leaves the narrow breakpoint', async () => {
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
      act(() => {
        setViewportWidth(500)
      })
      await screen.findByText('Einloggen')
      expect(requests).toBe(0)
    })

    // §4(2) — Musti's review question: `hasStarted` only ever gates the *first* automatic mint;
    // it must never read a FAILED first attempt as "already handled" and go quiet forever. A
    // failed mint still needs to recover — via the auto-retry-on-error effect (§4(1), keyed on
    // `state`, not on `enabled`/`hasStarted`) and via the manual retry link — even across a
    // resize that would otherwise look like "a fresh reason to try again". Proven end to end:
    // first attempt fails, the screen is resized down and back up (exercising the exact
    // sequence a `hasStarted`-blocks-forever bug would freeze on), and the auto-retry still
    // fires and succeeds — not a second *initial* mint from the resize (that's the sibling test
    // above), the *scheduled retry* the error state itself owns.
    it('recovers via auto-retry after a failed first attempt, even across a resize (never permanently latched shut by a failure)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          requests += 1
          return requests === 1 ? HttpResponse.error() : HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      setViewportWidth(1024)
      renderLogin()
      await screen.findByText('Wir versuchen es automatisch erneut …')
      expect(requests).toBe(1)

      // Resize down past `s` and back — must not itself trigger a second *initial* mint (the
      // latch correctly stays closed for that), and must not cancel the pending retry either.
      act(() => {
        setViewportWidth(320)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      act(() => {
        setViewportWidth(1024)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(requests).toBe(1)

      // The auto-retry backoff (2s base) fires on its own — the failed first attempt did not
      // permanently latch the column shut.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })
      expect(requests).toBe(2)
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')

      vi.clearAllTimers()
      vi.useRealTimers()
    })

    // Musti's #298 review, F1 — the actual bug: `retryAttempt` reset to 0 on ANY non-error
    // state, and `requestNewCode()` itself commits `{ kind: 'loading' }` before the mint
    // resolves — so every automatic retry re-entered the effect via 'loading' first and reset
    // the counter, and the backoff never grew. Musti's own measurement, reproduced exactly here
    // rather than approximated: 7 mints/70s at an immediate/synchronous reject (never exposed
    // the bug), vs. 31 mints/70s at a constant ~2300ms/attempt once the same failure carried a
    // genuine `delay(300)` first. Load-bearing detail this test gets right where the original
    // code's own test suite didn't: the mock below genuinely DELAYS before rejecting
    // (`delay(300)`, Musti's own figure — not an arbitrary smaller value picked to just barely
    // clear a macrotask boundary), so the mutation resolves on a later macrotask and React
    // actually commits the intermediate 'loading' render as its own frame — a *synchronous*
    // `HttpResponse.error()` (what every other test in this file uses) can resolve within the
    // same microtask flush as the `loading` state, and React 18's automatic batching then
    // coalesces `loading` and the following `error` into ONE commit, skipping the render this
    // bug depended on entirely. That is exactly why this bug shipped past this file's own suite
    // the first time — confirmed directly: this test's own negative assertions (the "must still
    // be N, not N+1" checks at just-under-the-expected-delay) fail correctly against the
    // pre-fix code, and pass against the fix.
    it('backs the retry delay off (2s → 4s → 8s → capped 16s) and stops after MAX_AUTO_RETRIES, never resetting mid-cycle (#298 F1)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      let requests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, async () => {
          requests += 1
          // The load-bearing detail (see comment above): a real delay, matching Musti's own
          // measurement method exactly, not a smaller value picked just to clear the boundary.
          await delay(300)
          return HttpResponse.error()
        }),
      )
      setViewportWidth(1024)
      renderLogin()

      await screen.findByText('Wir versuchen es automatisch erneut …')
      expect(requests).toBe(1)

      // Advances fake time in small, fixed steps until `requests` reaches `target`, and returns
      // how much fake time that actually took — measuring the GAP empirically rather than
      // asserting a cumulative absolute boundary (which is where an earlier draft of this test
      // got its own arithmetic wrong: `advanceTimersByTimeAsync` keeps ADDING to a running fake
      // clock, it does not reset a per-checkpoint baseline). `shouldAdvanceTime` genuinely tracks
      // wall-clock overhead too (this file's other tests already rely on it for
      // `findByText`/`waitFor` polling to progress at all), so a fixed small step size is what
      // keeps the measurement's own resolution well under the 2×/4×/8×/16000ms gaps it's trying
      // to tell apart.
      async function measureGapUntil(target: number, maxMs = 20_000, stepMs = 100): Promise<number> {
        const steps = maxMs / stepMs
        let elapsed = 0
        for (let i = 0; i < steps; i += 1) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(stepMs)
          })
          elapsed += stepMs
          if (requests >= target) return elapsed
        }
        throw new Error(`measureGapUntil: requests never reached ${target} within ${maxMs}ms (stuck at ${requests}).`)
      }

      // Each gap is measured from the PREVIOUS request's own failure (≈20ms mint delay) to the
      // next mint firing — asserted against the expected backoff with a tolerance band wide
      // enough to absorb that overhead and this environment's own scheduling jitter, but narrow
      // enough that the reset bug (a constant ~2000-2300ms every time, per Musti's own
      // measurement) cannot pass any of the later, larger-expected-gap checks.
      const gap1to2 = await measureGapUntil(2) // expect ≈2000ms
      expect(gap1to2).toBeGreaterThanOrEqual(1700)
      expect(gap1to2).toBeLessThan(3000)

      const gap2to3 = await measureGapUntil(3) // expect ≈4000ms — the reset bug caps this at ~2300
      expect(gap2to3).toBeGreaterThanOrEqual(3400)
      expect(gap2to3).toBeLessThan(5500)

      const gap3to4 = await measureGapUntil(4) // expect ≈8000ms
      expect(gap3to4).toBeGreaterThanOrEqual(7000)
      expect(gap3to4).toBeLessThan(10_000)

      const gap4to5 = await measureGapUntil(5) // expect ≈16000ms — RETRY_CAP_MS, not 16000×2
      expect(gap4to5).toBeGreaterThanOrEqual(14_000)
      expect(gap4to5).toBeLessThan(19_000)

      const gap5to6 = await measureGapUntil(6) // still capped at ≈16000ms, not growing further
      expect(gap5to6).toBeGreaterThanOrEqual(14_000)
      expect(gap5to6).toBeLessThan(19_000)

      const gap6to7 = await measureGapUntil(7) // the 6th and last automatic retry (MAX_AUTO_RETRIES)
      expect(gap6to7).toBeGreaterThanOrEqual(14_000)
      expect(gap6to7).toBeLessThan(19_000)

      // The cap: 6 automatic retries have now happened (7 mints total). No further request
      // fires on its own, no matter how long — this is the count cap Musti's F1(b) asked for,
      // distinct from the per-retry delay cap proven above.
      await screen.findByText('Die automatischen Versuche sind pausiert — bitte versuch es manuell noch einmal.')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000)
      })
      expect(requests).toBe(7)

      // The manual way out still works after the cap — it isn't a dead end.
      fireEvent.click(screen.getByText('Erneut versuchen'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
      expect(requests).toBe(8)

      vi.clearAllTimers()
      vi.useRealTimers()
    }, 30_000)

    // #283 §5, state 3 ("knapp") — ADR-0021: the boundary is the point, not just "some amber
    // text shows eventually". At 21s remaining the ordinary countdown must still be showing;
    // one tick later, at exactly 20s, the pre-warning must have taken over — a `< 20` off-by-one
    // would pass a looser assertion here but fail this one at the boundary itself.
    it('shows the amber pre-warning at exactly 20s remaining, and the ordinary countdown before that', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      server.use(http.post(`${BASE_URL}/v1/device/code`, () => HttpResponse.json({ ...DEVICE_CODE_RESPONSE, expiresIn: 22, interval: 5 }, { status: 201 })))
      setViewportWidth(1024)
      renderLogin()
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      await screen.findByText('Gilt noch 0:22')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await screen.findByText('Gilt noch 0:21')
      expect(screen.queryByText(/Läuft gleich ab/)).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      await screen.findByText('Läuft gleich ab — noch 0:20')
      expect(screen.queryByText('Gilt noch 0:20')).toBeNull()

      vi.clearAllTimers()
      vi.useRealTimers()
    })
  })

  // #238 AC-7: the device-approval flow embeds this exact screen in place rather than
  // navigating to it, so `onGuest`/`onRegister` must be omittable and the QR column
  // suppressible — otherwise a phone with no session, confirming someone else's code,
  // would be offered to sign that code in as a guest, or shown an unrelated second QR
  // column minting its own device code next to the one it's there to approve.
  describe('embedded usage (#238 AC-7 — device-approval detour)', () => {
    it('hides "Neu hier? Konto anlegen" and "weiter als Gast" when onGuest/onRegister are omitted', () => {
      renderLogin({ omitGuestAndRegister: true })
      expect(screen.queryByText('Neu hier? Konto anlegen')).toBeNull()
      expect(screen.queryByText('Erstmal als Gast umschauen')).toBeNull()
    })

    it('still shows both when onGuest/onRegister are provided — the top-level Login route is unaffected', () => {
      renderLogin()
      expect(screen.queryByText('Neu hier? Konto anlegen')).not.toBeNull()
      expect(screen.queryByText('Erstmal als Gast umschauen')).not.toBeNull()
    })

    it('never mounts the QR column when showDeviceQr is false, even at a wide breakpoint that would otherwise show it', async () => {
      setViewportWidth(1024)
      let deviceCodeRequests = 0
      server.use(
        http.post(`${BASE_URL}/v1/device/code`, () => {
          deviceCodeRequests += 1
          return HttpResponse.json(DEVICE_CODE_RESPONSE, { status: 201 })
        }),
      )
      renderLogin({ showDeviceQr: false, omitGuestAndRegister: true })

      // Give any (wrongly) mounted QR column's mount-time request a chance to fire before
      // asserting its absence — a synchronous check alone would pass even with a bug that
      // mounts the column and just hasn't resolved its fetch yet.
      await screen.findByText('Einloggen')
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()
      expect(deviceCodeRequests).toBe(0)
    })
  })
})
