import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { AssistantsListSection } from './AssistentenListSection'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'

const BASE_URL = 'http://localhost:3000'

function renderAssistantsList() {
  const i18n = createAppI18n('de')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AssistantsListSection />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('AssistentenListSection (ADR-0052 §10)', () => {
  // MCP-8, MCP-11: two assistants of one name are told apart by rights and destination; the /mcp address is shown.
  it('shows each assistant with its rights and where its access goes, and the /mcp server address', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/assistenten`, () =>
        HttpResponse.json([
          { clientId: 'a', name: 'Claude', linkedSince: '2026-11-01T12:00:00.000Z', lastUsed: null, scopes: ['openid', 'steuerdaten:read'], destinations: ['claude.ai'] },
          { clientId: 'b', name: 'Claude', linkedSince: '2026-11-02T12:00:00.000Z', lastUsed: null, scopes: ['steuerdaten:write', 'zahllink:write'], destinations: ['evil.example'] },
        ]),
      ),
    )
    renderAssistantsList()
    expect((await screen.findByTestId('assistent-ziel-a')).textContent).toBe('claude.ai')
    expect(screen.getByTestId('assistent-ziel-b').textContent).toBe('evil.example')
    expect(screen.getByTestId('assistent-rechte-a').textContent).toBe('Steuerdaten lesen (maskiert)')
    expect(screen.getByTestId('assistent-rechte-b').textContent).toContain('Bezahlvorgang')
    expect(screen.getByTestId('assistenten-server-adresse').textContent).toMatch(/\/mcp$/)
  })

  it('renders empty notice when no assistants are connected', async () => {
    server.use(
      http.get(`${BASE_URL}/v1/assistenten`, () => HttpResponse.json([])),
    )

    renderAssistantsList()

    expect(await screen.findByText('Keine Assistenten verbunden.')).toBeTruthy()
  })

  it('renders connected assistant and allows revoking it', async () => {
    let revokeCalled = false
    server.use(
      http.get(`${BASE_URL}/v1/assistenten`, () =>
        HttpResponse.json([
          {
            clientId: 'claude-desktop',
            name: 'Claude Desktop',
            linkedSince: '2026-11-01T12:00:00.000Z',
            lastUsed: '2026-11-03T18:00:00.000Z',
          },
        ]),
      ),
      http.delete(`${BASE_URL}/v1/assistenten/claude-desktop`, () => {
        revokeCalled = true
        return HttpResponse.json({ success: true })
      }),
    )

    renderAssistantsList()

    expect(await screen.findByText('Claude Desktop')).toBeTruthy()

    const disconnectBtn = screen.getByText('Trennen')
    fireEvent.click(disconnectBtn)

    await waitFor(() => {
      expect(revokeCalled).toBe(true)
    })
  })
})

describe('AssistentenListSection: connecting an assistant (ADR-0052 amendment 4)', () => {
  it('offers to connect an assistant', async () => {
    server.use(http.get(`${BASE_URL}/v1/assistenten`, () => HttpResponse.json([])))
    renderAssistantsList()
    expect(await screen.findByTestId('assistent-verbinden')).toBeTruthy()
  })
})

describe('AssistentenListSection: failures (WEB-49, NR-04)', () => {
  const ONE = [{ clientId: 'claude-desktop', name: 'Claude Desktop', linkedSince: '2026-11-01T12:00:00.000Z', lastUsed: null }]

  it('a failed load says so with a retry, never "Keine Assistenten verbunden"', async () => {
    let calls = 0
    server.use(
      http.get(`${BASE_URL}/v1/assistenten`, () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ statusCode: 500 }, { status: 500 }) : HttpResponse.json(ONE)
      }),
    )
    renderAssistantsList()
    expect(await screen.findByText('Bei uns ist gerade etwas schiefgelaufen. Versuch es gleich noch mal.')).toBeTruthy()
    expect(screen.queryByText('Keine Assistenten verbunden.')).toBeNull()
    expect(screen.queryByTestId('assistent-verbinden')).toBeNull()
    fireEvent.click(screen.getByTestId('assistenten-erneut-laden'))
    expect(await screen.findByText('Claude Desktop')).toBeTruthy()
  })

  it.each([
    [403, 'Das darfst du hier nicht ändern.'],
    [500, 'Trennen fehlgeschlagen. Bitte erneut versuchen.'],
  ])('a "Trennen" answered %i says it did not disconnect and keeps the assistant listed', async (status, message) => {
    server.use(
      http.get(`${BASE_URL}/v1/assistenten`, () => HttpResponse.json(ONE)),
      http.delete(`${BASE_URL}/v1/assistenten/claude-desktop`, () => HttpResponse.json({ statusCode: status }, { status })),
    )
    renderAssistantsList()
    fireEvent.click(await screen.findByText('Trennen'))
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByText('Claude Desktop')).toBeTruthy()
  })

  it('fails closed: every request answering 500 shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderAssistantsList()
    await expectFailsClosed(failing)
  })
})
