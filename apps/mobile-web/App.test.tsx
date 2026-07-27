// Smoke test for the app shell's stage wiring (steuereule#72) — not a re-test of each screen's
// own behaviour (that's LoginScreen.test.tsx / RegistrierungScreen.test.tsx / OnboardingScreen
// .test.tsx), just that Splash -> Login -> Registrierung -> Onboarding are actually reachable in
// sequence through the real App component, with the real providers (auth client + query client +
// i18n + theme) wired the way the deployed app boots. Splash is skipped via its own tap-to-skip
// affordance rather than waiting out its auto-advance timer, keeping this test fast.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from './src/test-msw-server'

const API_BASE_URL = 'http://localhost:3000'

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
})
