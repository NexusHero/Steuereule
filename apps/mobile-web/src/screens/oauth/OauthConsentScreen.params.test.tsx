// The consent screen when it is opened by the OAuth redirect itself (parameters from the address bar),
// with every scope wording, a failing client lookup and the ways the consent call can fail.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { OauthConsentScreen, type OauthConsentScreenProps } from './OauthConsentScreen'
import { server } from '../../test-msw-server'

const BASE_URL = 'http://localhost:3000'

function renderScreen(props: OauthConsentScreenProps = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <OauthConsentScreen {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => window.history.replaceState({}, '', '/'))

describe('OauthConsentScreen reading the address bar', () => {
  it('takes client, scope and the whole query from the URL when no props are given', async () => {
    window.history.replaceState({}, '', '/?client_id=chatbot&scope=belege%3Awrite+zahllink%3Aread&state=xyz')
    const bodies: unknown[] = []
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'chatbot', name: 'Chatbot', uri: null, icon: null })),
      http.post(`${BASE_URL}/api/auth/oauth2/consent`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ redirect: true, url: 'https://app.example/cb' })
      }),
    )
    const onNavigate = vi.fn()
    renderScreen({ onNavigate })

    expect(await screen.findByText('Chatbot')).toBeTruthy()
    expect(screen.getByText(/Belege hochladen/)).toBeTruthy()
    expect(screen.getByText(/Zahllink abrufen/)).toBeTruthy()
    expect(screen.queryByText(/Steuerdaten lesen/)).toBeNull()

    fireEvent.click(screen.getByTestId('oauth-erlauben'))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://app.example/cb'))
    expect(bodies[0]).toEqual({ accept: true, oauth_query: 'client_id=chatbot&scope=belege%3Awrite+zahllink%3Aread&state=xyz' })
  })

  it('offers the read access by default when no scope is named, and names the client by its id while unknown', async () => {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => new HttpResponse(null, { status: 404 })))
    renderScreen({ clientId: 'mystery-client' })

    expect(await screen.findByText('mystery-client')).toBeTruthy()
    expect(screen.getByText(/Steuerdaten lesen \(maskiert\)/)).toBeTruthy()
  })

  it('calls the client "KI-Assistent" when there is no client id at all', async () => {
    renderScreen({})
    expect(await screen.findByText('KI-Assistent')).toBeTruthy()
  })

  it('lists the write scope on its own', async () => {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'c', name: 'C', uri: null, icon: null })))
    renderScreen({ clientId: 'c', scope: 'steuerdaten:write' })
    expect(await screen.findByText(/Steuerfakten ausfüllen/)).toBeTruthy()
  })
})

describe('OauthConsentScreen decisions', () => {
  it('denies with accept=false', async () => {
    const bodies: { accept: boolean }[] = []
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'c', name: 'C', uri: null, icon: null })),
      http.post(`${BASE_URL}/api/auth/oauth2/consent`, async ({ request }) => {
        bodies.push((await request.json()) as { accept: boolean })
        return HttpResponse.json({ redirect: true, url: 'https://app.example/denied' })
      }),
    )
    const onNavigate = vi.fn()
    renderScreen({ clientId: 'c', scope: 'openid', oauthQuery: 'client_id=c', onNavigate })

    fireEvent.click(await screen.findByTestId('oauth-ablehnen'))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://app.example/denied'))
    expect(bodies[0]!.accept).toBe(false)
  })

  it.each([
    ['the server refuses', () => new HttpResponse(null, { status: 500 })],
    ['the answer has no redirect URL', () => HttpResponse.json({ redirect: false })],
    ['the network fails', () => HttpResponse.error()],
  ])('shows the authorisation error and lets the user try again when %s', async (_name, reply) => {
    server.use(
      http.get(`${BASE_URL}/v1/oauth/client-info`, () => HttpResponse.json({ clientId: 'c', name: 'C', uri: null, icon: null })),
      http.post(`${BASE_URL}/api/auth/oauth2/consent`, reply),
    )
    const onNavigate = vi.fn()
    renderScreen({ clientId: 'c', onNavigate })

    fireEvent.click(await screen.findByTestId('oauth-erlauben'))

    expect(await screen.findByText('Fehler bei der Autorisierung. Bitte versuchen Sie es erneut.')).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
    expect(screen.getByText('Verbindung erlauben')).toBeTruthy()
  })
})
