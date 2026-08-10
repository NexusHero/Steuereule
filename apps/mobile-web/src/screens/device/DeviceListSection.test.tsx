// DeviceListSection (#238, Decision 6). Real revocation itself — a revoked session's
// credential rejected on its next request, while a second, unrelated session for the same
// account keeps working — is a server-side property, already proven against the real
// better-auth `/api/auth/revoke-session` endpoint over real HTTP (real Postgres, not
// `.inject()`) in `apps/api/test/acceptance/req-014-device-approve-token.integration.test.ts`.
// This file's job is different and narrower: prove the UI calls that real endpoint with the
// right session's own token and reacts honestly to what it answers — not to re-derive a
// server property a frontend unit test has no way to check for real.
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { createAppAuthClient } from '../../auth/auth-client'
import { AuthClientProvider } from '../../auth/AuthClientProvider'
import { DeviceListSection } from './DeviceListSection'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

const CHROME_WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const FIREFOX_ANDROID_UA = 'Mozilla/5.0 (Android 14; Mobile; rv:126.0) Gecko/126.0 Firefox/126.0'

function renderDeviceList(opts: { onCurrentSessionRevoked?: () => void } = {}) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const authClient = createAppAuthClient(BASE_URL)
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AuthClientProvider client={authClient}>
            <DeviceListSection onCurrentSessionRevoked={opts.onCurrentSessionRevoked ?? (() => {})} />
          </AuthClientProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const CURRENT_SESSION = {
  user: { id: 'u1', email: 'kim@beispiel.de', emailVerified: true, name: 'Kim' },
  session: { id: 's-current', token: 'current-token', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
}

function mockSessions(sessions: ReadonlyArray<{ token: string; userAgent: string | null; updatedAt: string }>) {
  server.use(
    http.get(`${BASE_URL}/api/auth/get-session`, () => HttpResponse.json(CURRENT_SESSION)),
    http.get(`${BASE_URL}/api/auth/list-sessions`, () =>
      HttpResponse.json(
        sessions.map((s, i) => ({
          id: `session-${i}`,
          userId: 'u1',
          createdAt: '2026-08-01T14:32:00.000Z',
          expiresAt: '2026-08-08T14:32:00.000Z',
          ...s,
        })),
      ),
    ),
  )
}

describe('DeviceListSection (#238, Decision 6)', () => {
  it('shows an honest loading state before the sessions arrive', () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => new Promise(() => {})))
    renderDeviceList()
    expect(screen.getByLabelText('Geräte werden geladen …')).toBeTruthy()
  })

  it('renders browser, OS and last-active per session — no region field at all', async () => {
    mockSessions([{ token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' }])
    renderDeviceList()
    expect(await screen.findByText('Chrome')).toBeTruthy()
    expect(screen.getByText('Windows')).toBeTruthy()
    expect(screen.getByText(/2026/)).toBeTruthy()
    // The deliberate omission (Musti's ADR-0021 fail-closed ruling) — never a region label,
    // never a placeholder "Region unbekannt" either, because there is no column to be unknown.
    expect(screen.queryByText('Region')).toBeNull()
    expect(screen.queryByText('Region unbekannt')).toBeNull()
  })

  it('marks the current session distinctly from others', async () => {
    mockSessions([
      { token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' },
      { token: 'other-token', userAgent: FIREFOX_ANDROID_UA, updatedAt: '2026-07-01T10:00:00.000Z' },
    ])
    renderDeviceList()
    await screen.findByText('Chrome')
    expect(screen.getByText('Dieses Gerät')).toBeTruthy()
    expect(screen.getAllByText('Abmelden')).toHaveLength(2)
  })

  it('shows an honest empty state when the account has no other sessions', async () => {
    mockSessions([])
    renderDeviceList()
    expect(await screen.findByText('Keine weiteren Geräte angemeldet.')).toBeTruthy()
  })

  // #306 — this used to be one assertion, and it asserted the defect: a 500 is the server
  // *answering*, and the copy it expected told the user to check their connection. The
  // stakeholder hit the same class for real on a 403, with his name and Steuer-ID rendered
  // three lines above the message blaming his network.
  it('names the server, not the connection, when the server answered (#306)', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => HttpResponse.json({}, { status: 500 })))
    renderDeviceList()
    expect(
      await screen.findByText('Deine Geräte konnten nicht geladen werden — der Server hat sich gemeldet, aber das hat nicht geklappt. An deiner Verbindung liegt es nicht.'),
    ).toBeTruthy()
    // The defect, stated as an assertion so it cannot come back: the connection copy must not
    // appear on a response the server actually sent.
    expect(screen.queryByText('Deine Geräte konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeNull()
  })

  it('names the server, not the connection, on the 403 the stakeholder actually hit (#306)', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => HttpResponse.json({ code: 'SESSION_NOT_FRESH' }, { status: 403 })))
    renderDeviceList()
    expect(
      await screen.findByText('Deine Geräte konnten nicht geladen werden — der Server hat sich gemeldet, aber das hat nicht geklappt. An deiner Verbindung liegt es nicht.'),
    ).toBeTruthy()
  })

  // #336 review, F7 — `unknown` was the one variant with no screen test.
  //
  // The mechanism here is not the one the review and I both assumed. Measured, by instrumenting
  // the hook: a 200 carrying `text/html` does not throw a parse error and does not arrive as
  // `data: null`. better-auth returns `data: '<html>…</html>'` — a truthy string — with
  // `error: null`. Before the `Array.isArray` guard this fell through to `data.map(...)` and
  // threw a raw `TypeError`, and the honest copy appeared only because `reasonOf` defaults an
  // unclassified error to 'unknown'. Right answer, no decision behind it. The guard makes it a
  // decision; this test is what stops it reverting to luck.
  it('names no cause when something answered but we cannot read it (#306)', async () => {
    server.use(
      http.get(`${BASE_URL}/api/auth/list-sessions`, () =>
        HttpResponse.text('<html>Login to the hotel wifi</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      ),
    )
    renderDeviceList()
    expect(await screen.findByText('Deine Geräte konnten nicht geladen werden. Versuch es noch mal.')).toBeTruthy()
    // Neither cause may be asserted: nothing here establishes either one.
    expect(screen.queryByText('Deine Geräte konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeNull()
    expect(
      screen.queryByText('Deine Geräte konnten nicht geladen werden — der Server hat sich gemeldet, aber das hat nicht geklappt. An deiner Verbindung liegt es nicht.'),
    ).toBeNull()
  })

  // #336 review, F2 — a 200 with a null body used to be routed through
  // `classifyByStatus(undefined)` and came out as 'unreachable': the server answered, and the
  // screen blamed the connection. The defect this ticket exists to delete, inside its own fix.
  it('names no cause when the server answered 200 with nothing usable in it (#306)', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => HttpResponse.json(null, { status: 200 })))
    renderDeviceList()
    expect(await screen.findByText('Deine Geräte konnten nicht geladen werden. Versuch es noch mal.')).toBeTruthy()
    expect(screen.queryByText('Deine Geräte konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeNull()
  })

  it('blames the connection only when nothing answered (#306)', async () => {
    server.use(http.get(`${BASE_URL}/api/auth/list-sessions`, () => HttpResponse.error()))
    renderDeviceList()
    // The mirror defect this guards: asserting a server-side cause when the request never
    // completed would be the same over-claim pointed the other way.
    expect(await screen.findByText('Deine Geräte konnten nicht geladen werden. Prüf die Verbindung und versuch es noch mal.')).toBeTruthy()
    expect(
      screen.queryByText('Deine Geräte konnten nicht geladen werden — der Server hat sich gemeldet, aber das hat nicht geklappt. An deiner Verbindung liegt es nicht.'),
    ).toBeNull()
  })

  // The property itself — revocation actually revoking, one session rejected while another
  // keeps working — is proven server-side (see this file's header). What belongs here: the
  // real call is made with *this* session's own token, not a guessed or hard-coded one.
  it("revoking a device POSTs the real /api/auth/revoke-session with that exact session's token", async () => {
    mockSessions([
      { token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' },
      { token: 'other-token', userAgent: FIREFOX_ANDROID_UA, updatedAt: '2026-07-01T10:00:00.000Z' },
    ])
    let receivedBody: unknown
    server.use(
      http.post(`${BASE_URL}/api/auth/revoke-session`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ status: true })
      }),
    )
    renderDeviceList()
    await screen.findByText('Firefox')
    // The second row is the non-current (Firefox/Android) session — revoke that one.
    const signOutButtons = screen.getAllByText('Abmelden')
    fireEvent.click(signOutButtons[1]!)

    await waitFor(() => expect(receivedBody).toEqual({ token: 'other-token' }))
  })

  it('removes the revoked entry from the list once the real endpoint confirms it', async () => {
    mockSessions([
      { token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' },
      { token: 'other-token', userAgent: FIREFOX_ANDROID_UA, updatedAt: '2026-07-01T10:00:00.000Z' },
    ])
    server.use(http.post(`${BASE_URL}/api/auth/revoke-session`, () => HttpResponse.json({ status: true })))
    renderDeviceList()
    await screen.findByText('Firefox')

    // After revoking, the list's own refetch answers with only the current session left —
    // proving the row disappearing is a real refetch, not a client-side guess at what changed.
    server.use(
      http.get(`${BASE_URL}/api/auth/list-sessions`, () =>
        HttpResponse.json([
          {
            id: 'session-0',
            userId: 'u1',
            token: 'current-token',
            userAgent: CHROME_WINDOWS_UA,
            updatedAt: '2026-08-01T14:32:00.000Z',
            createdAt: '2026-08-01T14:32:00.000Z',
            expiresAt: '2026-08-08T14:32:00.000Z',
          },
        ]),
      ),
    )
    fireEvent.click(screen.getAllByText('Abmelden')[1]!)

    await waitFor(() => expect(screen.queryByText('Firefox')).toBeNull())
    expect(screen.getByText('Chrome')).toBeTruthy()
  })

  it('signs the app out when the revoked entry is the current session — never a stale screen for a gone session', async () => {
    mockSessions([{ token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' }])
    server.use(http.post(`${BASE_URL}/api/auth/revoke-session`, () => HttpResponse.json({ status: true })))
    let signedOut = false
    renderDeviceList({ onCurrentSessionRevoked: () => (signedOut = true) })

    await screen.findByText('Dieses Gerät')
    fireEvent.click(screen.getByText('Abmelden'))

    await waitFor(() => expect(signedOut).toBe(true))
  })

  it('does not sign the app out when a different, non-current session is revoked', async () => {
    mockSessions([
      { token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' },
      { token: 'other-token', userAgent: FIREFOX_ANDROID_UA, updatedAt: '2026-07-01T10:00:00.000Z' },
    ])
    let revokeCalled = false
    server.use(
      http.post(`${BASE_URL}/api/auth/revoke-session`, () => {
        revokeCalled = true
        return HttpResponse.json({ status: true })
      }),
    )
    let signedOut = false
    renderDeviceList({ onCurrentSessionRevoked: () => (signedOut = true) })

    await screen.findByText('Firefox')
    fireEvent.click(screen.getAllByText('Abmelden')[1]!)

    await waitFor(() => expect(revokeCalled).toBe(true))
    expect(signedOut).toBe(false)
  })

  it('shows an honest, retryable error if revoking fails — never a silent hang', async () => {
    mockSessions([{ token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' }])
    server.use(http.post(`${BASE_URL}/api/auth/revoke-session`, () => HttpResponse.json({}, { status: 500 })))
    renderDeviceList()

    await screen.findByText('Chrome')
    fireEvent.click(screen.getByText('Abmelden'))

    expect(await screen.findByText('Das hat nicht geklappt. Versuch es noch einmal.')).toBeTruthy()
    // Still listed, still revocable — not stuck.
    expect(screen.getByText('Abmelden')).toBeTruthy()
  })

  it('switches to English (ADR-0006)', async () => {
    mockSessions([{ token: 'current-token', userAgent: CHROME_WINDOWS_UA, updatedAt: '2026-08-01T14:32:00.000Z' }])
    const i18n = createAppI18n('en')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const authClient = createAppAuthClient(BASE_URL)
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ThemeProvider mode="light">
            <AuthClientProvider client={authClient}>
              <DeviceListSection onCurrentSessionRevoked={() => {}} />
            </AuthClientProvider>
          </ThemeProvider>
        </I18nextProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Signed-in devices')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()
    expect(screen.getByText('This device')).toBeTruthy()
  })
})
