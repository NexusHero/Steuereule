// #349 — a cold-start `/get-session` failure must never render the embedded LoginScreen to a
// user who might genuinely be signed in. Tests-first (ADR-0021): the cold-start-429 case below is
// written to fail red against the pre-fix `DeviceScreen` (it read only `sessionData === null`,
// discarding `error`) and to pass once the screen reads the honest `unknown` state instead. The
// PR body records the actual red-then-green run, not just this comment.
//
// The trap this suite is built to avoid (Musti's dispatch, ADR-0021 §5): at cold start `data` is
// already `null` before any fetch resolves, so "Login is not shown" can be satisfied by nothing
// more than the loading spinner never clearing — a test that only checks the login submit
// button's absence while stuck on "Wir prüfen deine Anmeldung …" proves nothing. Every case here
// first `findBy`s a *settled*, mock-specific piece of copy (the sessionUnknown heading, or
// GeraetefreigabeScreen's own loading text) before asserting anything about what is or isn't
// present — so a run that never leaves the loading state fails on the `findBy` itself, not
// silently passes.
//
// LoginScreen's own submit button text ('Einloggen'/'Log in') is what identifies its presence,
// not the "E-Mail" field label — `Feld`'s label `Text` carries no `accessibilityLabel`/`for`
// association to its `Input` (LoginScreen.tsx:302), so `getByLabelText('E-Mail')` would never
// match it; that would have been a query bug wearing a passing assertion's clothes.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { DeviceScreen } from './DeviceScreen'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

const REAL_SESSION = {
  user: { id: 'u1', email: 'anna@example.com', emailVerified: true, name: 'Anna' },
  session: { id: 's1', createdAt: new Date().toISOString() },
}

function mockSession(session: typeof REAL_SESSION | null, status = 200) {
  server.use(http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json(session, { status })))
}

function mockSessionFailure(status: number) {
  server.use(http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json({ message: 'nope' }, { status })))
}

function mockSessionNetworkError() {
  server.use(http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.error()))
}

function renderDevice(opts: { lng?: 'de' | 'en'; userCode?: string } = {}) {
  const i18n = createAppI18n(opts.lng ?? 'de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <DeviceScreen userCode={opts.userCode ?? 'K7QX-9F2M'} />
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('DeviceScreen — cold-start session read (#349)', () => {
  it('renders the embedded LoginScreen on a genuine cold-start "no session" (200, null) — the case that must keep working', async () => {
    mockSession(null)
    renderDevice()
    expect(await screen.findByText('Einloggen')).toBeTruthy()
  })

  it('goes straight past Login for a genuinely signed-in cold start (200, real session)', async () => {
    mockSession(REAL_SESSION)
    server.use(http.get(`${BASE_URL}/v1/device/pending`, () => new Promise(() => {})))
    renderDevice()
    await screen.findByLabelText('Wir laden die Anfrage …')
    expect(screen.queryByText('Einloggen')).toBeNull()
  })

  // The defect itself: a cold-start 429 is "we could not ask", never "you have no session".
  it('never renders the login form on a cold-start 429 — shows the honest "could not check" state instead', async () => {
    mockSessionFailure(429)
    renderDevice()

    await screen.findByText('Das können wir gerade nicht prüfen.')
    expect(screen.getByText('Wir können gerade nicht feststellen, ob du angemeldet bist. Versuch es noch mal.')).toBeTruthy()
    expect(screen.queryByText('Einloggen')).toBeNull()
  })

  it('never renders the login form on a cold-start genuine network failure either', async () => {
    mockSessionNetworkError()
    renderDevice()

    await screen.findByText('Das können wir gerade nicht prüfen.')
    expect(screen.queryByText('Einloggen')).toBeNull()
  })

  it('never renders the login form on a cold-start 500 either', async () => {
    mockSessionFailure(500)
    renderDevice()

    await screen.findByText('Das können wir gerade nicht prüfen.')
    expect(screen.queryByText('Einloggen')).toBeNull()
  })

  // The one status better-auth's own atom already treats as authoritative — this must still work.
  it('does render the login form on a cold-start 401 (the one status that genuinely means "signed out")', async () => {
    mockSessionFailure(401)
    renderDevice()
    expect(await screen.findByText('Einloggen')).toBeTruthy()
  })

  it('the "could not check" state offers a real retry, not a dead end', async () => {
    let getSessionCalls = 0
    server.use(
      http.get(`${BASE_URL}/api/auth/get-session`, () => {
        getSessionCalls += 1
        if (getSessionCalls === 1) return HttpResponse.json({ message: 'nope' }, { status: 429 })
        return HttpResponse.json(null, { status: 200 })
      }),
    )
    renderDevice()

    await screen.findByText('Das können wir gerade nicht prüfen.')
    fireEvent.click(screen.getByText('Noch mal versuchen'))

    // The retry's own answer (a genuine "no session") now renders Login — proving the retry
    // button actually re-asks better-auth rather than just re-rendering the same stale state.
    expect(await screen.findByText('Einloggen')).toBeTruthy()
  })

  it('renders correctly in English (ADR-0006)', async () => {
    mockSessionFailure(429)
    renderDevice({ lng: 'en' })
    await screen.findByText("We can't check that right now.")
    expect(screen.getByText("We can't tell right now whether you're signed in. Try again.")).toBeTruthy()
  })
})
