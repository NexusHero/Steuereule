import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { OauthConsentScreen } from './OauthConsentScreen'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

function renderConsentScreen(props: {
  clientId?: string
  scope?: string
  oauthQuery?: string
  onNavigate?: (url: string) => void
}) {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <OauthConsentScreen {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
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
