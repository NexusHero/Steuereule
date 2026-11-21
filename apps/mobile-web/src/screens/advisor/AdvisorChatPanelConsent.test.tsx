// Real-data run, finding 4: the owl pointed to a consent "under this answer" that never appeared,
// and after consenting the user had to type everything again. The card sits under every answer the
// server marks, and "Erlauben" lets the owl answer the last message again without retyping (ADR-0091).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { AdvisorChatMessageView } from '@steuereule/core'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'

const CONSENT_URL = '*/v1/eulen-modus/personendaten-einwilligung'

const i18n = createAppI18n('de')
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
beforeEach(() => queryClient.clear())

function panel(props: Partial<AdvisorChatPanelProps>) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider mode="light">
          <AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

const user = (id: string, content: string): AdvisorChatMessageView => ({ id, role: 'user', content, meta: null, createdAt: '2026-11-11T10:00:00.000Z', status: 'complete' })
const owlAskingForConsent = (id: string): AdvisorChatMessageView => ({
  id, role: 'assistant', content: 'Dafür brauche ich deine Einwilligung.', meta: { personalDataConsentRequest: true }, createdAt: '2026-11-11T10:00:01.000Z', status: 'complete',
})

const allow = async () => {
  server.use(http.put(CONSENT_URL, () => HttpResponse.json({ granted: true, version: '1', grantedAt: '2026-11-14T10:00:00.000Z' })))
  fireEvent.click(await screen.findByRole('button', { name: 'Erlauben' }))
}

describe('AdvisorChatPanel: consent to personal data in the chat (ADR-0091)', () => {
  it('shows the consent card under an answer the server marked', async () => {
    render(panel({ messages: [user('u1', 'Unsere Tochter kam 2021 zur Welt.'), owlAskingForConsent('a1')] }))
    expect(await screen.findByText('Darf die Eule deine persönlichen Daten verarbeiten?')).toBeTruthy()
  })

  it('goes on after „Erlauben“ and keeps the first answer: its questions do not vanish (real-data run)', async () => {
    const onSendMessage = vi.fn()
    render(panel({ messages: [user('u1', 'Unsere Tochter kam 2021 zur Welt.'), owlAskingForConsent('a1')], onSendMessage }))
    await allow()
    // Nothing in the question was masked: the owl is told the consent exists, as a new turn, replacing nothing.
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('Ich habe dir erlaubt, meine persönlichen Daten zu verarbeiten. Bitte mach mit meiner letzten Nachricht weiter.'))
    expect(onSendMessage.mock.calls.every((call) => call[1]?.replaceFromMessageId === undefined)).toBe(true)
  })

  it('sends what the user typed, not its masked stored form', async () => {
    const onSendMessage = vi.fn()
    const typed = 'Meine Steuer-ID ist 12 345 678 901.'
    const view = render(panel({ onSendMessage }))
    fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: typed } })
    fireEvent.click(screen.getByTestId('advisor-chat-send'))
    expect(onSendMessage).toHaveBeenLastCalledWith(typed)

    view.rerender(panel({ messages: [user('u1', 'Meine Steuer-ID ist [STEUER-ID-GESCHÜTZT].'), owlAskingForConsent('a1')], onSendMessage }))
    await allow()
    // The stored question is masked, so the owl has to hear the words as typed: again, as a new turn.
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(2))
    expect(onSendMessage.mock.calls[1]).toEqual([typed])
  })

  it('tells the owl that the consent exists when the typed words are gone (a reload)', async () => {
    const onSendMessage = vi.fn()
    render(panel({ messages: [user('u1', 'Meine Steuer-ID ist [STEUER-ID-GESCHÜTZT].'), owlAskingForConsent('a1')], onSendMessage }))
    await allow()
    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('Ich habe dir erlaubt, meine persönlichen Daten zu verarbeiten. Bitte mach mit meiner letzten Nachricht weiter.'))
  })

  it('does not restart an older turn: only the card under the latest answer continues the conversation', async () => {
    const onSendMessage = vi.fn()
    render(panel({ messages: [user('u1', 'Unsere Tochter kam 2021 zur Welt.'), owlAskingForConsent('a1'), user('u2', 'Und der Arbeitsweg?'), { ...owlAskingForConsent('a2'), meta: null }], onSendMessage }))
    await allow()
    expect(await screen.findByText(/Erlaubt\./)).toBeTruthy()
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})
