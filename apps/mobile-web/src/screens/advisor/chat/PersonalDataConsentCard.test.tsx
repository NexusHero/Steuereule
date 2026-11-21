import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../../i18n/app-i18n'
import { server } from '../../../test-msw-server'
import { PersonalDataConsentCard } from './PersonalDataConsentCard'

const URL_PATTERN = '*/v1/eulen-modus/personendaten-einwilligung'

function renderCard(onGranted?: () => void, provider?: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <PersonalDataConsentCard onGranted={onGranted} {...(provider !== undefined ? { provider } : {})} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

describe('PersonalDataConsentCard (ADR-0091)', () => {
  it('names the provider that is actually configured, never a fixed one (real-data run)', async () => {
    const first = renderCard(undefined, 'anthropic')
    expect(await screen.findByText(/Claude \(Anthropic als Auftragsverarbeiter\)/)).toBeTruthy()
    expect(screen.queryByText(/Google/)).toBeNull()
    first.unmount()
    const second = renderCard(undefined, 'openai')
    expect(await screen.findByText(/OpenAI \(OpenAI als Auftragsverarbeiter\)/)).toBeTruthy()
    second.unmount()
    // No model configured, or one the app does not know by name: nothing is claimed about who gets the data.
    renderCard(undefined, null)
    expect(await screen.findByText(/das Sprachmodell, das für die Eule eingerichtet ist/)).toBeTruthy()
    expect(screen.queryByText(/Google|Gemini/)).toBeNull()
  })

  it('asks for consent while it is not granted', async () => {
    renderCard(undefined, 'google-genai')
    expect(await screen.findByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeTruthy()
    expect(screen.getByText(/Google Gemini/)).toBeTruthy()
    expect(screen.getByText(/Art\. 9 DSGVO/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erlauben' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nicht erlauben' })).toBeTruthy()
  })

  it('is not shown when consent is already granted', async () => {
    server.use(http.get(URL_PATTERN, () => HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })))
    renderCard()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Erlauben' })).toBeNull())
    expect(screen.queryByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeNull()
  })

  it('sends granted:true on Erlauben and then shows the granted state', async () => {
    let body: unknown = null
    server.use(
      http.put(URL_PATTERN, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })
      }),
    )
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    await waitFor(() => expect(body).toEqual({ granted: true }))
    expect(await screen.findByText(/Erlaubt\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Erlauben' })).toBeNull()
  })

  it('hides itself on Nicht erlauben without sending anything', async () => {
    let put = false
    server.use(http.put(URL_PATTERN, () => { put = true; return HttpResponse.json({ granted: false, version: '1', grantedAt: null }) }))
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Nicht erlauben' }))
    expect(screen.queryByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeNull()
    expect(put).toBe(false)
  })

  it('tells the chat once the consent is stored, so the conversation goes on by itself', async () => {
    server.use(http.put(URL_PATTERN, () => HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })))
    const onGranted = vi.fn()
    renderCard(onGranted)
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    await waitFor(() => expect(onGranted).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/macht mit deiner letzten Nachricht weiter/)).toBeTruthy()
  })

  it('does not continue when storing the consent failed', async () => {
    server.use(http.put(URL_PATTERN, () => HttpResponse.json({}, { status: 500 })))
    const onGranted = vi.fn()
    renderCard(onGranted)
    fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
    expect(await screen.findByText('Das hat nicht geklappt. Bitte versuche es noch einmal.')).toBeTruthy()
    expect(onGranted).not.toHaveBeenCalled()
  })
})
