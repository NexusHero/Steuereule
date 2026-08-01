// Smoke test for the app shell's routing (steuereule#72, rewired for #238 task 1b's Stage ->
// Route rework at the composition root) — not a re-test of each screen's own behaviour (that's
// LoginScreen.test.tsx / RegistrierungScreen.test.tsx / OnboardingScreen.test.tsx), just that
// Splash -> Login -> Registrierung -> Onboarding are actually reachable in sequence through the
// real App component and its real `@react-navigation/native` router, with the real providers
// (auth client + query client + i18n + theme) wired the way the deployed app boots. Splash is
// skipped via its own tap-to-skip affordance rather than waiting out its auto-advance timer,
// keeping this test fast.
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
})
