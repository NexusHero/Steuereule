import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { OauthConsentScreen } from './OauthConsentScreen'
import { server } from '../../../test/test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../../test/test-every-query-fails'
import { renderWithQuery } from '../../../test/test-render'

const BASE_URL = 'http://localhost:3000'

function renderConsentScreen(props: {
  clientId?: string
  scope?: string
  oauthQuery?: string
  onNavigate?: (url: string) => void
}) {
  return renderWithQuery(<OauthConsentScreen {...props} />)
}

/** Mocks the client lookup and a consent endpoint that answers with a redirect; returns every consent body POSTed. */
function mockConsentRedirectingTo(redirectUrl: string) {
  const consentBodies: unknown[] = []
  server.use(
    http.get(`${BASE_URL}/v1/oauth/client-info`, () =>
      HttpResponse.json({
        clientId: 'claude-desktop',
        name: 'Claude Desktop',
        uri: null,
        icon: null,
      }),
    ),
    http.post(`${BASE_URL}/api/auth/oauth2/consent`, async ({ request }) => {
      consentBodies.push(await request.json())
      return HttpResponse.json({ redirect: true, url: redirectUrl })
    }),
  )
  return consentBodies
}

describe('OauthConsentScreen (ADR-0052 §2 / §9 / §10)', () => {
  it('renders client name, requested scopes, and third-country notice', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('clientId') === 'claude-desktop') {
          return HttpResponse.json({
            clientId: 'claude-desktop',
            name: 'Claude Desktop',
            uri: 'https://claude.ai',
            icon: null,
          })
        }
        return new HttpResponse(null, { status: 404 })
      }),
    )

    renderConsentScreen({
      clientId: 'claude-desktop',
      scope: 'openid steuerdaten:read steuerdaten:write belege:write zahllink:read',
      oauthQuery: 'client_id=claude-desktop&scope=openid',
    })

    expect(await screen.findByText('Claude Desktop')).toBeTruthy()
    expect(screen.getByText('Hinweis zur Datenübertragung (Drittland)')).toBeTruthy()
    expect(screen.getByText(/USA/)).toBeTruthy()
    expect(screen.getByText('Verbindung erlauben')).toBeTruthy()
    expect(screen.getByText('Ablehnen')).toBeTruthy()
  })

  // An assistant registers itself and picks its own name: a client called "Claude" may redirect to anyone's
  // server. The screen therefore says where the approval leads and that the name is unchecked.
  function mockClient(name: string, redirectTargets: { uri: string; destination: string }[]) {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'c1', name, uri: null, icon: null, redirectTargets })))
  }

  it('shows where the approval leads, so a borrowed name does not hide a foreign server', async () => {
    mockClient('Claude', [{ uri: 'https://evil.example/cb', destination: 'evil.example' }])
    renderConsentScreen({ clientId: 'c1', scope: 'steuerdaten:read', oauthQuery: `client_id=c1&redirect_uri=${encodeURIComponent('https://evil.example/cb')}` })

    expect(await screen.findByText('evil.example')).toBeTruthy()
    expect(screen.getByText('Nicht von SteuerEule geprüft')).toBeTruthy()
    expect(screen.getByText(/Den Namen hat der Assistent selbst angegeben/)).toBeTruthy()
  })

  it('does not let the user approve before the destination is on the screen', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, async () => {
        await held
        return HttpResponse.json({ clientId: 'c1', name: 'Claude', uri: null, icon: null, redirectTargets: [{ uri: 'https://evil.example/cb', destination: 'evil.example' }] })
      }),
    )
    renderConsentScreen({ clientId: 'c1', scope: 'steuerdaten:read', oauthQuery: 'client_id=c1' })

    const allow = await screen.findByTestId('oauth-erlauben')
    expect(allow.getAttribute('aria-disabled') ?? String((allow as HTMLButtonElement).disabled)).toBe('true')
    expect(screen.queryByTestId('oauth-destination')).toBeNull()

    release()
    expect(await screen.findByText('evil.example')).toBeTruthy()
    await waitFor(() => expect((screen.getByTestId('oauth-erlauben').getAttribute('aria-disabled') ?? String((screen.getByTestId('oauth-erlauben') as HTMLButtonElement).disabled))).not.toBe('true'))
  })

  it('says "an app on this device" for a loopback or app-scheme redirect', async () => {
    mockClient('Claude Desktop', [
      { uri: 'http://127.0.0.1:33418/callback', destination: 'localhost' },
      { uri: 'cursor://oauth/callback', destination: 'cursor://' },
    ])
    renderConsentScreen({ clientId: 'c1', scope: 'steuerdaten:read', oauthQuery: 'client_id=c1' })

    expect(await screen.findByText('eine App auf diesem Gerät, eine App auf diesem Gerät (cursor://)')).toBeTruthy()
  })

  it('says the address is unknown when the client cannot be looked up', async () => {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => new HttpResponse(null, { status: 404 })))
    renderConsentScreen({ clientId: 'gone', scope: 'steuerdaten:read', oauthQuery: 'client_id=gone' })

    expect(await screen.findByText('eine unbekannte Adresse')).toBeTruthy()
  })

  it('says that a lasting connection (offline_access) stays until revoked (ADR-0052 §10)', async () => {
    mockConsentRedirectingTo('http://localhost:9999/callback?code=x')
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read offline_access' })
    expect(await screen.findByText(/bleibt bestehen, bis Sie sie unter „Verbundene Assistenten“ widerrufen/)).toBeTruthy()
  })

  it('approving calls the consent endpoint with accept: true and navigates to the redirect url', async () => {
    const consentBodies = mockConsentRedirectingTo('http://127.0.0.1:8080/callback?code=test-code-123')
    const onNavigate = vi.fn()

    renderConsentScreen({
      clientId: 'claude-desktop',
      scope: 'steuerdaten:read',
      oauthQuery: 'client_id=claude-desktop&sig=xyz',
      onNavigate,
    })

    const allowBtn = await screen.findByText('Verbindung erlauben')
    fireEvent.click(allowBtn)

    await waitFor(() => {
      expect(consentBodies).toEqual([
        {
          accept: true,
          oauth_query: 'client_id=claude-desktop&sig=xyz',
        },
      ])
      expect(onNavigate).toHaveBeenCalledWith('http://127.0.0.1:8080/callback?code=test-code-123')
    })
  })

  it('denying calls the consent endpoint with accept: false', async () => {
    const consentBodies = mockConsentRedirectingTo('http://127.0.0.1:8080/callback?error=access_denied')
    const onNavigate = vi.fn()

    renderConsentScreen({
      clientId: 'claude-desktop',
      scope: 'steuerdaten:read',
      oauthQuery: 'client_id=claude-desktop&sig=xyz',
      onNavigate,
    })

    const denyBtn = await screen.findByText('Ablehnen')
    fireEvent.click(denyBtn)

    await waitFor(() => {
      expect(consentBodies).toEqual([
        {
          accept: false,
          oauth_query: 'client_id=claude-desktop&sig=xyz',
        },
      ])
      expect(onNavigate).toHaveBeenCalledWith('http://127.0.0.1:8080/callback?error=access_denied')
    })
  })

  it('asks for the password when approving needs a step-up, then approves (ADR-0106 D2)', async () => {
    const consentBodies: unknown[] = []
    const verifiedWith: string[] = []
    const onNavigate = vi.fn()
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'claude-desktop', name: 'Claude Desktop', uri: null, icon: null })),
      http.post(`${BASE_URL}/api/auth/oauth2/consent`, async ({ request }) => {
        consentBodies.push(await request.json())
        if (verifiedWith.length === 0) return HttpResponse.json({ code: 'FRESH_AUTH_REQUIRED', message: 'step-up' }, { status: 403 })
        return HttpResponse.json({ redirect: true, url: 'https://assistant.example/callback?code=abc' })
      }),
      http.post(`${BASE_URL}/api/auth/verify-password`, async ({ request }) => {
        verifiedWith.push(((await request.json()) as { password: string }).password)
        return HttpResponse.json({ status: true })
      }),
    )
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read', oauthQuery: 'client_id=claude-desktop', onNavigate })

    fireEvent.click(await screen.findByTestId('oauth-erlauben'))
    await screen.findByTestId('oauth-stepup')
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('oauth-stepup-passwort'), { target: { value: 'correct-password' } })
    fireEvent.click(screen.getByTestId('oauth-stepup-bestaetigen'))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://assistant.example/callback?code=abc'))
    expect(verifiedWith).toEqual(['correct-password'])
    expect(consentBodies).toHaveLength(2)
  })

})

describe('OauthConsentScreen — failures say what to do (NR-13, MCP-17 in this file, WEB-28)', () => {
  function lookupOk() {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'claude-desktop', name: 'Claude Desktop', uri: null, icon: null })))
  }

  it('an expired approval (400 after 10 minutes) says to start the connection again', async () => {
    lookupOk()
    server.use(http.post(`${BASE_URL}/api/auth/oauth2/consent`, () => HttpResponse.json({ error: 'invalid_request' }, { status: 400 })))
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read', oauthQuery: 'client_id=claude-desktop&sig=x' })
    fireEvent.click(await screen.findByText('Verbindung erlauben'))
    expect(await screen.findByText('Diese Freigabe ist abgelaufen oder nicht mehr gültig. Starte die Verbindung in deinem Assistenten neu.')).toBeTruthy()
  })

  it('a 429 says when to try again', async () => {
    lookupOk()
    server.use(http.post(`${BASE_URL}/api/auth/oauth2/consent`, () => HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '10' } })))
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read', oauthQuery: 'client_id=claude-desktop&sig=x' })
    fireEvent.click(await screen.findByText('Verbindung erlauben'))
    expect(await screen.findByText('Gerade kommen zu viele Anfragen. Versuch es in 10 Sekunden noch mal.')).toBeTruthy()
  })

  it('a failed client lookup keeps "Erlauben" off and offers a retry', async () => {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({}, { status: 500 })))
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read', oauthQuery: 'client_id=claude-desktop&sig=x' })
    expect(await screen.findByTestId('oauth-lookup-fehler')).toBeTruthy()
    expect(screen.getByTestId('oauth-erlauben').getAttribute('aria-disabled')).toBe('true')
  })

  it('a failed lookup and its retry say nothing about the destination; the answer names it', async () => {
    let fail = true
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, async () => {
        if (fail) return HttpResponse.json({}, { status: 503 })
        await held
        return HttpResponse.json({ clientId: 'c1', name: 'Claude', uri: null, icon: null, redirectTargets: [{ uri: 'http://127.0.0.1:9/callback', destination: 'localhost' }] })
      }),
    )
    renderConsentScreen({ clientId: 'c1', scope: 'steuerdaten:read', oauthQuery: 'client_id=c1&redirect_uri=http%3A%2F%2F127.0.0.1%3A9%2Fcallback' })
    expect(await screen.findByTestId('oauth-lookup-fehler')).toBeTruthy()
    expect(screen.queryByTestId('oauth-destination')).toBeNull()
    expect(screen.queryByText('eine unbekannte Adresse')).toBeNull()

    fail = false
    fireEvent.click(screen.getByTestId('oauth-lookup-erneut'))
    await waitFor(() => expect(screen.queryByTestId('oauth-destination')).toBeNull())
    expect(screen.queryByText('eine unbekannte Adresse')).toBeNull()
    expect(screen.getByTestId('oauth-erlauben').getAttribute('aria-disabled')).toBe('true')

    release()
    expect(await screen.findByText('eine App auf diesem Gerät')).toBeTruthy()
  })

  it('fails closed: every request answering 500 shows a failure and grants nothing', async () => {
    const failing = failEveryRequest()
    renderConsentScreen({ clientId: 'claude-desktop', scope: 'steuerdaten:read', oauthQuery: 'client_id=claude-desktop&sig=x' })
    // "Ablehnen" refuses the access and carries no stored data; it stays possible while the lookup fails.
    await expectFailsClosed(failing, { allowWrites: [/^POST \/api\/auth\/oauth2\/consent$/] })
  })
})
