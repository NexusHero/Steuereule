import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { AssistantsListSection } from './AssistentenListSection'
import { server } from '../../test-msw-server'

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
