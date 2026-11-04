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

  it('approving calls the consent endpoint with accept: true and navigates to the redirect url', async () => {
    let consentBody: unknown = null
    const onNavigate = vi.fn()

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
        consentBody = await request.json()
        return HttpResponse.json({
          redirect: true,
          url: 'http://127.0.0.1:8080/callback?code=test-code-123',
        })
      }),
    )

    renderConsentScreen({
      clientId: 'claude-desktop',
      scope: 'steuerdaten:read',
      oauthQuery: 'client_id=claude-desktop&sig=xyz',
      onNavigate,
    })

    const allowBtn = await screen.findByText('Verbindung erlauben')
    fireEvent.click(allowBtn)

    await waitFor(() => {
      expect(consentBody).toEqual({
        accept: true,
        oauth_query: 'client_id=claude-desktop&sig=xyz',
      })
      expect(onNavigate).toHaveBeenCalledWith('http://127.0.0.1:8080/callback?code=test-code-123')
    })
  })

  it('denying calls the consent endpoint with accept: false', async () => {
    let consentBody: unknown = null
    const onNavigate = vi.fn()

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
        consentBody = await request.json()
        return HttpResponse.json({
          redirect: true,
          url: 'http://127.0.0.1:8080/callback?error=access_denied',
        })
      }),
    )

    renderConsentScreen({
      clientId: 'claude-desktop',
      scope: 'steuerdaten:read',
      oauthQuery: 'client_id=claude-desktop&sig=xyz',
      onNavigate,
    })

    const denyBtn = await screen.findByText('Ablehnen')
    fireEvent.click(denyBtn)

    await waitFor(() => {
      expect(consentBody).toEqual({
        accept: false,
        oauth_query: 'client_id=claude-desktop&sig=xyz',
      })
      expect(onNavigate).toHaveBeenCalledWith('http://127.0.0.1:8080/callback?error=access_denied')
    })
  })
})
