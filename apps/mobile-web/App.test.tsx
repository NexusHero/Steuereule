// Smoke test for the app shell's routing (steuereule#72, rewired for #238 task 1b's Stage ->
// Route rework at the composition root) — not a re-test of each screen's own behaviour (that's
// LoginScreen.test.tsx / RegistrierungScreen.test.tsx / OnboardingScreen.test.tsx), just that
// Splash -> Login -> Registrierung -> Onboarding are actually reachable in sequence through the
// real App component and its real `@react-navigation/native` router, with the real providers
// (auth client + query client + i18n + theme) wired the way the deployed app boots. Splash is
// skipped via its own tap-to-skip affordance rather than waiting out its auto-advance timer,
// keeping this test fast.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from './src/test-msw-server'

const API_BASE_URL = 'http://localhost:3000'

// The router (task 1b) reads real browser history, which — unlike the `Stage` state it
// replaces — is not reset by RTL's `cleanup()` between tests; jsdom keeps one `window` for the
// whole file. Without this, a test that navigated to `/app` would leak that URL into the next
// test's fresh `render(<App />)`, which would mount straight into the tabbed shell instead of
// Splash. Every test in this file gets a clean `/` to start from, exactly like `Stage`'s old
// `useState('splash')` default did.
beforeEach(() => {
  window.history.pushState({}, '', '/')
})

// LoginScreen.test.tsx's own helper, copied rather than imported — `useBreakpoint` reads
// `document.documentElement.clientWidth` (jsdom default: 0, breakpoint `s`) and only re-reads on
// a real `resize` event. Needed here once, for AC-7's own test: the desktop side of that flow
// only shows its QR device-login column (and therefore only mints a code at all) at `m`/`l`.
function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

/** Walks guest onboarding to completion — the only way into the tabbed shell. */
async function completeOnboarding() {
  await screen.findByPlaceholderText('Kim')
  fireEvent.change(screen.getByPlaceholderText('Kim'), { target: { value: 'Kim' } })
  fireEvent.change(screen.getByPlaceholderText('Yilmaz'), { target: { value: 'Yilmaz' } })
  fireEvent.click(screen.getByText('Weiter'))

  fireEvent.change(await screen.findByPlaceholderText('12 345 678 901'), { target: { value: '12345678901' } })
  fireEvent.click(screen.getByText('Weiter'))

  // Step 3 is the optional Steuernummer — skipped, which is a legitimate guest path.
  fireEvent.click(screen.getByText('Weiter'))

  // Await the summary before pressing its CTA: the CTA is a different button from the step
  // one, and clicking before it exists is how this silently stalled on the summary.
  await screen.findByText('Deine Maske')
  fireEvent.click(screen.getByText('Weiter'))
}

// App.tsx constructs the better-auth client once, at module top level (correct for the real
// app — the client's own fetch just uses the real global `fetch`). Under MSW, though, that
// module-level construction must happen strictly after `test-setup.ts`'s `beforeAll` has
// installed MSW's `fetch` patch, or the client captures the real, unpatched `fetch` and every
// request bypasses MSW entirely. A static top-of-file `import App from './App'` is evaluated
// during Vitest's collection phase, which runs *before* `beforeAll` — so it's imported
// dynamically inside each test instead, after the suite has actually started running.
describe('App', () => {
  // A genuine end-to-end flow (real MSW sign-up + four screen transitions: Splash skip -> Login
  // -> Registrierung -> sign-up success -> Onboarding). Each step below already awaits via
  // `findBy*` (RTL's own auto-retry), one step at a time, rather than one long `waitFor` lumping
  // several transitions together — so it's the *total* budget across every step that needs to be
  // generous, not any single assertion racing the clock. That total, not any one `findBy*`, is
  // what tips over vitest's 5000ms default `testTimeout` under CI's parallel-CPU contention (the
  // same class of flake as the `RegistrierungScreen` "onDone" hardening) — this test genuinely
  // needs more wall-clock than a single short interaction does, so it gets its own realistic
  // per-test timeout instead of a blanket bump to the whole suite's default.
  it(
    'goes from Login, to Registrierung (via the real "create account" link), through a real sign-up, to Onboarding',
    async () => {
      server.use(
        http.post(`${API_BASE_URL}/api/auth/sign-up/email`, () =>
          HttpResponse.json({ token: 'tok_1', user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' } }),
        ),
      )
      const { default: App } = await import('./App')
      render(<App />)

      fireEvent.click(screen.getByLabelText('Weiter zur App'))
      // `findBy*` rather than a bare synchronous `getByText`: the Splash->Login stage flip is
      // driven by the same click->handler round trip through RN-Web's Pressable response system
      // that motivated the `waitFor` hardening in `RegistrierungScreen.test.tsx` — under CI's CPU
      // contention it can land a tick later than a synchronous assertion allows for.
      await screen.findByText('Einloggen')
      fireEvent.click(screen.getByText('Neu hier? Konto anlegen'))

      expect(await screen.findByText('Konto anlegen')).toBeTruthy()
      fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'neu@beispiel.de' } })
      fireEvent.change(screen.getByPlaceholderText('Mindestens 6 Zeichen'), { target: { value: 'geheim1' } })
      fireEvent.click(screen.getByText('Konto anlegen'))

      await screen.findByText('Willkommen bei SteuerEule.')
      fireEvent.click(screen.getByText('Weiter zum Onboarding →'))

      await screen.findByPlaceholderText('Kim')
    },
    // The suite-wide `testTimeout` in vitest.config.ts now carries this; kept explicit only
    // because this flow is the longest one and the reason the headroom exists.
    15_000,
  )

  it('goes from Login straight to Onboarding via guest mode, unchanged from before this slice', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(screen.getByLabelText('Weiter zur App'))
    fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
    await screen.findByPlaceholderText('Kim')
  })
  // The point of the tab bar slice: Profil (REQ-013) shipped, but Cockpit took the
  // post-onboarding home slot, leaving Profil with no route at all in the running app. This
  // proves a user can actually get to it — and back — through the real shell.
  it(
    'reaches Profil from Cockpit through the tab bar, and back again',
    async () => {
      const { default: App } = await import('./App')
      render(<App />)
      fireEvent.click(screen.getByLabelText('Weiter zur App'))
      fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))

      // Guest onboarding, filled the way OnboardingScreen actually requires, to land in
      // the tabbed shell: name -> Steuer-ID -> summary -> save.
      await completeOnboarding()

      // Cockpit is the default tab, matching the DS reference.
      await screen.findByText('Cockpit')

      fireEvent.click(screen.getByText('Profil'))
      // ProfilScreen's own card label — Profil is genuinely rendered, not just tab state.
      await screen.findByText('Deine Angaben')

      fireEvent.click(screen.getByText('Cockpit'))
      // Cockpit's app-bar title — we are genuinely back on the Cockpit screen.
      await screen.findByText('Steuerjahr')
    },
    15_000,
  )

  it('offers only the tabs that have a screen behind them', async () => {
    const { default: App } = await import('./App')
    render(<App />)
    fireEvent.click(screen.getByLabelText('Weiter zur App'))
    fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
    await completeOnboarding()
    await screen.findByText('Cockpit')

    // The DS reference lists five tabs; Belege, Berater and Jahr have no screen yet, so
    // offering them would be a dead affordance (the honesty rule).
    expect(screen.queryByText('Belege')).toBeNull()
    expect(screen.queryByText('Berater')).toBeNull()
    expect(screen.queryByText('Jahr')).toBeNull()
  })

  // REQ-011 (ADR-0013, steuereule#152) — Datenschutz is reached from Profil, never a tab of its
  // own (TAB_ORDNUNG groups it with Profil), and has a real back affordance.
  it(
    'reaches Datenschutz from Profil’s "Deine Daten" row, and back again — a guest sees the honest no-account notice',
    async () => {
      server.use(http.get(`${API_BASE_URL}/api/auth/get-session`, () => HttpResponse.json(null)))
      const { default: App } = await import('./App')
      render(<App />)
      fireEvent.click(screen.getByLabelText('Weiter zur App'))
      fireEvent.click(screen.getByText('Erstmal als Gast umschauen'))
      await completeOnboarding()
      await screen.findByText('Cockpit')

      fireEvent.click(screen.getByText('Profil'))
      await screen.findByText('Deine Angaben')

      fireEvent.click(screen.getByText('So schützen wir deine Daten (DSGVO)'))
      await screen.findByText('Noch kein Konto')
      // The tab bar hides on this drill-down screen (its own back button is the way out).
      expect(screen.queryByText('Cockpit')).toBeNull()

      fireEvent.click(screen.getByLabelText('Zurück'))
      await screen.findByText('Deine Angaben')
    },
    15_000,
  )

  it(
    'a completed account deletion from Datenschutz returns the app to a signed-out state (Login), never a stale screen for a gone account',
    async () => {
      const session = {
        user: { id: 'u1', email: 'neu@beispiel.de', emailVerified: true, name: '' },
        session: { id: 's1', createdAt: new Date().toISOString() },
      }
      server.use(
        http.post(`${API_BASE_URL}/api/auth/sign-up/email`, () => HttpResponse.json({ token: 'tok_1', user: session.user })),
        http.get(`${API_BASE_URL}/api/auth/get-session`, () => HttpResponse.json(session)),
        http.delete(`${API_BASE_URL}/v1/account`, () =>
          HttpResponse.json({ deleted: { profile: true, account: true }, retainedAnonymisedAuditRows: 0, retainedUnderLegalHold: 0 }, { status: 200 }),
        ),
      )
      const { default: App } = await import('./App')
      render(<App />)
      fireEvent.click(screen.getByLabelText('Weiter zur App'))
      await screen.findByText('Einloggen')
      fireEvent.click(screen.getByText('Neu hier? Konto anlegen'))
      expect(await screen.findByText('Konto anlegen')).toBeTruthy()
      fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'neu@beispiel.de' } })
      fireEvent.change(screen.getByPlaceholderText('Mindestens 6 Zeichen'), { target: { value: 'geheim1' } })
      fireEvent.click(screen.getByText('Konto anlegen'))
      await screen.findByText('Willkommen bei SteuerEule.')
      fireEvent.click(screen.getByText('Weiter zum Onboarding →'))
      await completeOnboarding()
      await screen.findByText('Cockpit')

      fireEvent.click(screen.getByText('Profil'))
      await screen.findByText('Deine Angaben')
      fireEvent.click(screen.getByText('So schützen wir deine Daten (DSGVO)'))
      await screen.findByText('Konto & Daten löschen')

      fireEvent.click(screen.getByText('Konto & Daten löschen'))
      await screen.findByText('Bevor du löschst')
      fireEvent.click(screen.getByText('Weiter ohne Export'))
      await screen.findByText('Bist du sicher?')
      fireEvent.click(screen.getByText('Ja, endgültig löschen'))

      await screen.findByText('Einloggen')
    },
    20_000,
  )

  // #238 task 1b's own done-when: "every previous Stage transition reachable by URL." Each of
  // these sets the browser URL via `history.pushState` *before* mount — the mechanism AC-1 (#238)
  // names explicitly — and asserts the route's screen renders directly, with no click sequence
  // and no `setStage` involved. A router that only reacted to in-app navigation and ignored the
  // URL it was opened on would fail every one of these while still passing the sequential flow
  // above, which is exactly why that flow alone was never sufficient proof of a real router.
  describe('every route is reachable by opening its URL directly, not just by clicking through', () => {
    it('/login resolves straight to Login', async () => {
      window.history.pushState({}, '', '/login')
      const { default: App } = await import('./App')
      render(<App />)
      expect(await screen.findByText('Einloggen')).toBeTruthy()
    })

    it('/registrierung resolves straight to Registrierung', async () => {
      window.history.pushState({}, '', '/registrierung')
      const { default: App } = await import('./App')
      render(<App />)
      expect(await screen.findByText('Konto anlegen')).toBeTruthy()
    })

    it('/onboarding resolves straight to Onboarding', async () => {
      window.history.pushState({}, '', '/onboarding')
      const { default: App } = await import('./App')
      render(<App />)
      expect(await screen.findByPlaceholderText('Kim')).toBeTruthy()
    })

    it('/app resolves straight to the tabbed shell, Cockpit first', async () => {
      window.history.pushState({}, '', '/app')
      const { default: App } = await import('./App')
      render(<App />)
      expect(await screen.findByText('Cockpit')).toBeTruthy()
      expect(await screen.findByText('Profil')).toBeTruthy()
    })

    it('an unmapped path falls back to Splash, not to whichever screen happened to render last', async () => {
      window.history.pushState({}, '', '/nonexistent')
      const { default: App } = await import('./App')
      render(<App />)
      expect(await screen.findByLabelText('Weiter zur App')).toBeTruthy()
      expect(screen.queryByText('Einloggen')).toBeNull()
      expect(screen.queryByText('Konto anlegen')).toBeNull()
      expect(screen.queryByPlaceholderText('Kim')).toBeNull()
      expect(screen.queryByText('Cockpit')).toBeNull()
    })
  })

  // #238 AC-1/AC-2 — the device-authorization route, resolved through the same real router
  // proven above, with the session-based fork task 3 needs. AC-7's own full round trip (the
  // no-session detour actually completing a login and landing back on the same pending code)
  // is task 4's own test — this file proves the fork exists and the embedded-Login mechanism
  // renders in place, which is what task 4 builds on rather than re-proving from scratch.
  describe('the device-authorization route (#238 AC-1/AC-2)', () => {
    // Every other describe block in this file only ever moves the shared, module-level
    // `authClient` (App.tsx constructs it once, matching the real app's own boot) from "no
    // session" *toward* "a real session" — a direction that never needs the underlying
    // nanostore to actually restart. These tests need the opposite: a real session in one
    // test, then none at all in the next. Without `resetModules()`, `authClient.useSession()`'s
    // session atom does not necessarily refetch on a fresh `<App/>` mount here — nanostores'
    // own deferred unsubscribe cleanup (see issue #240, the same mechanism traced there)
    // deliberately survives a quick unmount→remount, so the *previous* test's cached session
    // value can still be what a brand-new render sees, regardless of this test's own MSW
    // override. Forcing a fresh module (and therefore a fresh `authClient`/session atom) per
    // test here is what actually isolates them — confirmed by watching this fail without it
    // (the "no session" test rendered the approval screen, carrying over the previous test's
    // real session) before adding this line.
    beforeEach(() => {
      vi.resetModules()
    })

    function mockPendingRequest(overrides: Partial<{ userCode: string; status: string; userAgent: string | null; region: string | null; requestedAt: string | null }> = {}) {
      server.use(
        http.get(`${API_BASE_URL}/v1/device/pending`, () =>
          HttpResponse.json(
            {
              userCode: 'K7QX-9F2M',
              status: 'pending',
              userAgent: 'DesktopBrowser/1.0',
              region: 'unknown',
              requestedAt: '2026-08-01T14:32:00.000Z',
              ...overrides,
            },
            { status: 200 },
          ),
        ),
      )
    }

    it('AC-1: a real route resolves /device?user_code=… to the approval screen (a signed-in phone)', async () => {
      server.use(
        http.get(`${API_BASE_URL}/api/auth/get-session`, () =>
          HttpResponse.json({ user: { id: 'u1', email: 'phone@beispiel.de', emailVerified: true, name: '' }, session: { id: 's1' } }),
        ),
      )
      mockPendingRequest()
      window.history.pushState({}, '', '/device?user_code=K7QX-9F2M')
      const { default: App } = await import('./App')
      render(<App />)

      expect(await screen.findByText('K7QX-9F2M')).toBeTruthy()
      expect(screen.getByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeTruthy()
    })

    it('AC-2: a phone with a real session skips Login entirely — no "Einloggen" ever renders', async () => {
      server.use(
        http.get(`${API_BASE_URL}/api/auth/get-session`, () =>
          HttpResponse.json({ user: { id: 'u1', email: 'phone@beispiel.de', emailVerified: true, name: '' }, session: { id: 's1' } }),
        ),
      )
      mockPendingRequest()
      window.history.pushState({}, '', '/device?user_code=K7QX-9F2M')
      const { default: App } = await import('./App')
      render(<App />)

      await screen.findByText('K7QX-9F2M')
      expect(screen.queryByText('Einloggen')).toBeNull()
    })

    it('AC-2: a phone with no session renders Login embedded, in place — never the approval screen', async () => {
      // test-msw-server's default `get-session` answer is already `null` — asserted
      // explicitly here anyway so this test doesn't depend on that default silently.
      server.use(http.get(`${API_BASE_URL}/api/auth/get-session`, () => HttpResponse.json(null)))
      mockPendingRequest()
      window.history.pushState({}, '', '/device?user_code=K7QX-9F2M')
      const { default: App } = await import('./App')
      render(<App />)

      expect(await screen.findByText('Einloggen')).toBeTruthy()
      expect(screen.queryByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeNull()
      // AC-7's mechanism: embedding, not navigating — the URL (and therefore `user_code`)
      // never changes just because Login rendered in its place.
      expect(window.location.pathname + window.location.search).toBe('/device?user_code=K7QX-9F2M')
    })

    it('AC-7 mechanism: the embedded Login omits guest/register and its own QR column — a guest/new account has nothing to approve with', async () => {
      server.use(http.get(`${API_BASE_URL}/api/auth/get-session`, () => HttpResponse.json(null)))
      let deviceCodeRequests = 0
      server.use(
        http.post(`${API_BASE_URL}/v1/device/code`, () => {
          deviceCodeRequests += 1
          return HttpResponse.json({}, { status: 201 })
        }),
      )
      // Wide, deliberately: at `s` the QR column is already hidden regardless of
      // `showDeviceQr` (LoginScreen's own `bp === 's' || !showDeviceQr` gate) — asserting at
      // jsdom's default width would pass even if `showDeviceQr={false}` were dropped entirely,
      // proving nothing about the embedded-usage flag this test exists to check.
      setViewportWidth(1024)
      window.history.pushState({}, '', '/device?user_code=K7QX-9F2M')
      const { default: App } = await import('./App')
      render(<App />)

      await screen.findByText('Einloggen')
      expect(screen.queryByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeNull()
      expect(screen.queryByText('Neu hier? Konto anlegen')).toBeNull()
      expect(screen.queryByText('Erstmal als Gast umschauen')).toBeNull()
      expect(deviceCodeRequests).toBe(0)
    })

    it('honestly reports a missing code when /device is opened with no user_code at all', async () => {
      server.use(
        http.get(`${API_BASE_URL}/api/auth/get-session`, () =>
          HttpResponse.json({ user: { id: 'u1', email: 'phone@beispiel.de', emailVerified: true, name: '' }, session: { id: 's1' } }),
        ),
      )
      window.history.pushState({}, '', '/device')
      const { default: App } = await import('./App')
      render(<App />)

      expect(await screen.findByText('Kein Code angegeben')).toBeTruthy()
    })

    it('shows an honest loading state while the phone\'s own session is still being checked', async () => {
      server.use(http.get(`${API_BASE_URL}/api/auth/get-session`, () => new Promise(() => {})))
      window.history.pushState({}, '', '/device?user_code=K7QX-9F2M')
      const { default: App } = await import('./App')
      render(<App />)

      expect(await screen.findByLabelText('Wir prüfen deine Anmeldung …')).toBeTruthy()
      expect(screen.queryByText('Einloggen')).toBeNull()
      expect(screen.queryByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeNull()
    })

    // #238 task 4 — AC-7's own full round trip. Everything up to here proved the fork exists
    // and that Login renders embedded, in place; this proves the *detour completes*: a real
    // sign-in, inside that embedded form, actually lands the phone on the approval screen —
    // showing the identical code, not merely *a* code — and that the whole journey, the
    // desktop's own mint included, cost exactly one `POST /v1/device/code`. Both assertions are
    // load-bearing together: "the same code" alone would still pass a second, coincidentally
    // identical mint — exactly what a careless mock could produce — which is the entire reason
    // AC-7 names the request count explicitly rather than trusting the value alone.
    it('AC-7: the no-session detour completes a real login and lands on the identical pending code — exactly one POST /v1/device/code for the whole flow', async () => {
      const AC7_CODE = 'AC7X-9F2M'
      let deviceCodeRequests = 0
      server.use(
        http.post(`${API_BASE_URL}/v1/device/code`, () => {
          deviceCodeRequests += 1
          return HttpResponse.json(
            {
              userCode: AC7_CODE,
              deviceCode: 'ac7-device-code',
              verificationUriComplete: `http://localhost:8081/device?user_code=${AC7_CODE}`,
              expiresIn: 120,
              interval: 5,
            },
            { status: 201 },
          )
        }),
      )

      // The desktop half of the story: Login at a wide breakpoint, its own QR column mints
      // the one code this whole flow counts. A real, separate render — not a value handed
      // straight to the phone's render below — so the count below is genuine, not assumed.
      setViewportWidth(1024)
      window.history.pushState({}, '', '/login')
      const { default: DesktopApp } = await import('./App')
      const desktop = render(<DesktopApp />)
      await screen.findByLabelText('QR-Code zum Anmelden mit dem Handy')
      expect(await screen.findByText(AC7_CODE)).toBeTruthy()
      expect(deviceCodeRequests).toBe(1)
      desktop.unmount()

      // The phone half: a genuinely separate app instance — the desktop and phone are
      // different browsers in reality, sharing nothing but this one MSW-mocked backend, so a
      // fresh module (and therefore a fresh `authClient`) here is the same reasoning as this
      // describe block's own per-test `resetModules()`, just applied mid-test on purpose.
      vi.resetModules()
      setViewportWidth(375)

      let phoneSignedIn = false
      server.use(
        http.get(`${API_BASE_URL}/api/auth/get-session`, () =>
          HttpResponse.json(
            phoneSignedIn
              ? { user: { id: 'u-phone', email: 'phone@beispiel.de', emailVerified: true, name: '' }, session: { id: 's-phone' } }
              : null,
          ),
        ),
        http.post(`${API_BASE_URL}/api/auth/sign-in/email`, () => {
          phoneSignedIn = true
          return HttpResponse.json({ user: { id: 'u-phone', email: 'phone@beispiel.de', emailVerified: true, name: '' }, token: 'phone-session-token' })
        }),
        http.get(`${API_BASE_URL}/v1/device/pending`, () =>
          HttpResponse.json(
            { userCode: AC7_CODE, status: 'pending', userAgent: 'DesktopBrowser/1.0', region: 'unknown', requestedAt: '2026-08-01T14:32:00.000Z' },
            { status: 200 },
          ),
        ),
      )

      window.history.pushState({}, '', `/device?user_code=${AC7_CODE}`)
      const { default: PhoneApp } = await import('./App')
      render(<PhoneApp />)

      // No session yet — the embedded Login, not the approval screen, and no way out of it
      // toward registration or guest (both already proven unreachable from here).
      await screen.findByText('Einloggen')
      expect(screen.queryByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeNull()
      expect(screen.queryByText('Neu hier? Konto anlegen')).toBeNull()
      expect(screen.queryByText('Erstmal als Gast umschauen')).toBeNull()

      fireEvent.change(screen.getByPlaceholderText('du@beispiel.de'), { target: { value: 'phone@beispiel.de' } })
      fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'geheim1' } })
      fireEvent.click(screen.getByText('Einloggen'))

      // The URL never changed underneath this — no navigation happened, the same mounted
      // route just flips what it renders once its own session read updates. Landing here is
      // the actual proof of the embedded mechanism, not merely that it was *designed* to work.
      expect(await screen.findByText(AC7_CODE)).toBeTruthy()
      expect(screen.getByText('Steht dieser Code gerade auf deinem Bildschirm?')).toBeTruthy()
      expect(window.location.pathname + window.location.search).toBe(`/device?user_code=${AC7_CODE}`)

      // The two assertions AC-7 needs, together: identical value, and exactly one mint across
      // the desktop's page load *and* the phone's whole detour.
      await waitFor(() => expect(deviceCodeRequests).toBe(1))
    })
  })
})
