// The consent screen when it is opened by the OAuth redirect itself (parameters from the address bar),
// with every scope wording, a failing client lookup and the ways the consent call can fail.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { OauthConsentScreen, type OauthConsentScreenProps } from './OauthConsentScreen'
import { server } from '../../test-msw-server'
import { renderWithQuery } from '../../test-render'

const BASE_URL = 'http://localhost:3000'

function renderScreen(props: OauthConsentScreenProps = {}) {
  return renderWithQuery(<OauthConsentScreen {...props} />)
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
    expect(screen.getByText(/Belege samt Datei hochladen/)).toBeTruthy()
    // The legacy payment scope says what it does: it opens a checkout (H2-21).
    expect(screen.getByText(/legt einen Bezahlvorgang beim Zahlungsanbieter an/)).toBeTruthy()
    expect(screen.queryByText(/Steuerdaten lesen/)).toBeNull()

    fireEvent.click(screen.getByTestId('oauth-erlauben'))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('https://app.example/cb'))
    expect(bodies[0]).toEqual({ accept: true, oauth_query: 'client_id=chatbot&scope=belege%3Awrite+zahllink%3Aread&state=xyz' })
  })

  // MCP-17: a failed lookup names no requester from the URL, grants nothing by default, and cannot be allowed.
  it('with a failed client lookup it shows no client id as the requester, claims no scope and keeps "Erlauben" off', async () => {
    server.use(http.get(`${BASE_URL}/v1/oauth/client-info`, () => new HttpResponse(null, { status: 404 })))
    renderScreen({ clientId: 'mystery-client' })

    expect(await screen.findByTestId('oauth-client-unbekannt')).toBeTruthy()
    expect(screen.getByText('Unbekannter Assistent')).toBeTruthy()
    expect(screen.queryByText('mystery-client')).toBeNull()
    expect(screen.getByTestId('oauth-keine-rechte')).toBeTruthy()
    expect(screen.queryByText(/Steuerdaten lesen \(maskiert\)/)).toBeNull()
    expect(screen.getByTestId('oauth-erlauben').getAttribute('aria-disabled') ?? String((screen.getByTestId('oauth-erlauben') as HTMLButtonElement).disabled)).toBe('true')
  })

  it('without any client id it names no assistant and cannot be allowed', async () => {
    renderScreen({})
    expect(await screen.findByText('Unbekannter Assistent')).toBeTruthy()
    expect(screen.getByTestId('oauth-erlauben').getAttribute('aria-disabled') ?? String((screen.getByTestId('oauth-erlauben') as HTMLButtonElement).disabled)).toBe('true')
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
