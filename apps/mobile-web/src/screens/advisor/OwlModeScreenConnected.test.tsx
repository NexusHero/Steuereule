import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from '@steuereule/ui'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { expectFailsClosed, failEveryRequest } from '../../test-every-query-fails'
import { OwlModeScreen } from './OwlModeScreen'
import { confirmAction } from '../../confirm/confirmInTest'

// The owl screen without a copilot bridge: every action of the view must become the request the
// API contract names, and a refusal must show as a failure instead of a silent success.

interface Call {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

const NOW = '2026-11-14T10:00:00.000Z'
const CONVERSATIONS = [
  { id: 'c1', title: 'Fortbildung', createdAt: NOW, lastUsedAt: NOW, answering: false, chatModel: null },
  { id: 'c2', title: 'Homeoffice', createdAt: NOW, lastUsedAt: NOW, answering: false, chatModel: null },
]

function session(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    greeting: 'Hallo!',
    openCards: [],
    conversationId: 'c1',
    conversations: CONVERSATIONS,
    projects: [{ taxYear: 2026, conversations: CONVERSATIONS }],
    context: { usedTokens: 100, maxTokens: 6000, percent: 2, level: 'ok', canSummarize: true },
    notes: [{ id: 'n1', text: 'Pendelt mit der Bahn', createdAt: NOW, updatedAt: NOW }],
    situation: { text: 'Verheiratet', updatedAt: NOW },
    messages: [
      { id: 'm1', role: 'user', content: 'Frage', meta: null, createdAt: NOW, status: 'complete' },
      { id: 'm2', role: 'assistant', content: 'Antwort der Eule.', meta: null, createdAt: NOW, status: 'complete' },
    ],
    quickChips: [],
    legalSources: [],
    ...overrides,
  }
}

let calls: Call[]
let refuse: Set<string>

/** Answers every owl request with 200 (or 500 for the routes in `refuse`) and writes down what was sent. */
function recordRoutes(sessionBody = session()) {
  const record = (method: string, path: string) => async ({ request }: { request: Request }) => {
    const text = await request.text()
    calls.push({ method, path, body: text ? JSON.parse(text) : null })
    if (refuse.has(`${method} ${path}`)) return HttpResponse.json({ message: 'nein' }, { status: 500 })
    return HttpResponse.json({ id: 'c3', ok: true }, { status: 200 })
  }
  server.use(
    http.get('*/v1/steuerjahre/:jahr/advisor/session', () => HttpResponse.json(sessionBody, { status: 200 })),
    http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ enabled: true }, { status: 200 })),
    http.put('*/v1/eulen-modus/einstellung', record('PUT', 'einstellung')),
    http.post('*/v1/steuerjahre/:jahr/advisor/conversations', record('POST', 'conversations')),
    http.put('*/v1/steuerjahre/:jahr/advisor/conversations/:id', record('PUT', 'conversation')),
    http.delete('*/v1/steuerjahre/:jahr/advisor/conversations/:id', record('DELETE', 'conversation')),
    http.delete('*/v1/steuerjahre/:jahr/advisor/session', record('DELETE', 'session')),
    http.delete('*/v1/steuerjahre/:jahr/advisor/chat', record('DELETE', 'chat')),
    http.post('*/v1/steuerjahre/:jahr/advisor/chat', record('POST', 'chat')),
    http.post('*/v1/steuerjahre/:jahr/advisor/notes', record('POST', 'notes')),
    http.put('*/v1/steuerjahre/:jahr/advisor/notes/:id', record('PUT', 'note')),
    http.patch('*/v1/steuerjahre/:jahr/advisor/notes/:id', record('PATCH', 'note')),
    http.delete('*/v1/steuerjahre/:jahr/advisor/notes/:id', record('DELETE', 'note')),
    http.put('*/v1/steuerjahre/:jahr/advisor/situation', record('PUT', 'situation')),
    http.post('*/v1/steuerjahre/:jahr/advisor/situation', record('POST', 'situation')),
    http.put('*/v1/steuerjahre/:jahr/advisor/messages/:id/feedback', record('PUT', 'feedback')),
    http.post('*/v1/steuerjahre/:jahr/advisor/messages/:id/feedback', record('POST', 'feedback')),
    http.post('*/v1/steuerjahre/:jahr/advisor/conversations/:id/summarize', record('POST', 'summarize')),
  )
}

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function renderConnected(props: Partial<Parameters<typeof OwlModeScreen>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <OwlModeScreen taxYear={2026} {...props} />
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  )
}

const callTo = (method: string, path: string) => calls.find((c) => c.method === method && c.path === path)

beforeEach(() => {
  calls = []
  refuse = new Set()
  setViewportWidth(1440)
  server.use(http.get('*/v1/steuerjahre/:jahr/advisor/opening', () => HttpResponse.json({ shouldOpen: false, stage: 'start', lastOpening: null }, { status: 200 })))
})
afterEach(() => setViewportWidth(0))

describe('the connected owl screen (no copilot bridge)', () => {
  it('says that the owl could not be loaded when the session is refused, and loads again on retry', async () => {
    server.use(http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    renderConnected()
    const retry = await screen.findByText('Noch mal versuchen')
    server.use(http.get('*/v1/eulen-modus/einstellung', () => HttpResponse.json({ enabled: true }, { status: 200 })))
    recordRoutes()
    fireEvent.click(retry)
    await screen.findByTestId('eulen-modus-screen')
  })

  it('starts a new conversation, renames and deletes one through the sidebar', async () => {
    recordRoutes()
    renderConnected()
    await screen.findByTestId('eule-project-sidebar')
    fireEvent.click(screen.getByTestId('eule-conversation-new'))
    await waitFor(() => expect(callTo('POST', 'conversations')).toBeDefined())

    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-rename'))
    fireEvent.change(screen.getByTestId('eule-conversation-rename-input'), { target: { value: 'Neuer Titel' } })
    fireEvent.click(screen.getByTestId('eule-conversation-rename-save'))
    await waitFor(() => expect(callTo('PUT', 'conversation')?.body).toEqual({ title: 'Neuer Titel' }))

    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-delete'))
    fireEvent.click(screen.getByTestId('eule-conversation-delete-confirm'))
    await waitFor(() => expect(callTo('DELETE', 'conversation')).toBeDefined())
  })

  it('opens another conversation from the sidebar', async () => {
    recordRoutes()
    renderConnected()
    await screen.findByTestId('eule-project-sidebar')
    fireEvent.click(screen.getAllByTestId('eule-conversation-open')[1]!)
    await waitFor(() => expect(screen.getAllByTestId('eule-conversation-row').length).toBe(2))
  })

  it('sends a typed message to the chat endpoint', async () => {
    recordRoutes()
    renderConnected()
    await screen.findByTestId('advisor-chat-input')
    fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: 'Was gilt für Fahrtkosten?' } })
    fireEvent.click(screen.getByTestId('advisor-chat-send'))
    await waitFor(() => expect(callTo('POST', 'chat')?.body).toMatchObject({ message: 'Was gilt für Fahrtkosten?' }))
  })

  it('WEB-14: a message that could not be sent stays in the composer, with the reason in words', async () => {
    recordRoutes()
    refuse.add('POST chat')
    renderConnected()
    await screen.findByTestId('advisor-chat-input')
    fireEvent.change(screen.getByTestId('advisor-chat-input'), { target: { value: 'Was gilt für Fahrtkosten?' } })
    fireEvent.click(screen.getByTestId('advisor-chat-send'))
    expect((await screen.findByTestId('speichern-fehlgeschlagen')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen.')
    await waitFor(() => expect((screen.getByTestId('advisor-chat-input') as HTMLInputElement).value).toBe('Was gilt für Fahrtkosten?'))
  })

  it('stores a new situation and a new note, and changes and deletes the note', async () => {
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-situation-chip'))
    fireEvent.change(screen.getByTestId('eule-situation-input'), { target: { value: 'Verheiratet, ein Kind' } })
    fireEvent.click(screen.getByTestId('eule-situation-save'))
    await waitFor(() => expect(calls.some((c) => c.path === 'situation')).toBe(true))

    fireEvent.click(screen.getByTestId('eule-note-add'))
    fireEvent.change(screen.getByTestId('eule-note-input'), { target: { value: 'Neue Notiz' } })
    fireEvent.click(screen.getByTestId('eule-note-save'))
    await waitFor(() => expect(callTo('POST', 'notes')?.body).toEqual({ text: 'Neue Notiz' }))

    fireEvent.click(screen.getByTestId('eule-note-edit'))
    fireEvent.change(screen.getByTestId('eule-note-input'), { target: { value: 'Geänderte Notiz' } })
    fireEvent.click(screen.getByTestId('eule-note-save'))
    await waitFor(() => expect(calls.some((c) => c.path === 'note' && c.method !== 'DELETE')).toBe(true))

    fireEvent.click(screen.getByTestId('eule-note-delete'))
    confirmAction('noteDelete')
    await waitFor(() => expect(callTo('DELETE', 'note')).toBeDefined())
  })

  it('shows a failed note instead of pretending it was stored', async () => {
    refuse.add('POST notes')
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-situation-chip'))
    fireEvent.click(screen.getByTestId('eule-note-add'))
    fireEvent.change(screen.getByTestId('eule-note-input'), { target: { value: 'Neue Notiz' } })
    fireEvent.click(screen.getByTestId('eule-note-save'))
    expect(await screen.findByTestId('eule-note-failed')).toBeDefined()
  })

  it('rates an answer', async () => {
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('advisor-feedback-up'))
    await waitFor(() => expect(calls.some((c) => c.path === 'feedback')).toBe(true))
  })

  it('clears the conversation after the confirmation', async () => {
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    fireEvent.click(screen.getByTestId('eule-clear-conversation-btn'))
    fireEvent.click(screen.getByTestId('eule-clear-confirm-btn'))
    await waitFor(() => expect(calls.some((c) => c.path === 'session' || c.path === 'chat')).toBe(true))
  })

  it('turns the opt-in off through the settings', async () => {
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    fireEvent.click(screen.getByTestId('eulen-modus-opt-in'))
    await waitFor(() => expect(callTo('PUT', 'einstellung')).toBeDefined())
  })

  it('NR-05: a refused opt-in switch or new conversation says so instead of failing silently', async () => {
    recordRoutes()
    refuse.add('PUT einstellung')
    refuse.add('POST conversations')
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    fireEvent.click(screen.getByTestId('eulen-modus-opt-in'))
    expect((await screen.findByTestId('speichern-fehlgeschlagen')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen.')
  })

  it('NR-05: a refused "Neues Gespräch" says so', async () => {
    recordRoutes()
    refuse.add('POST conversations')
    renderConnected()
    await screen.findByTestId('eule-project-sidebar')
    fireEvent.click(screen.getByTestId('eule-conversation-new'))
    expect((await screen.findByTestId('speichern-fehlgeschlagen')).textContent).toContain('Bei uns ist gerade etwas schiefgelaufen.')
  })

  it('stores the chosen occupation group and the model picked for the conversation', async () => {
    recordRoutes()
    server.use(
      http.post('*/v1/steuerjahre/:jahr/interview/antworten', async ({ request }) => {
        calls.push({ method: 'POST', path: 'antworten', body: await request.json() })
        return HttpResponse.json({ answers: {}, nextStep: { kind: 'question', id: 'job' }, openItems: 3 }, { status: 200 })
      }),
      http.put('*/v1/steuerjahre/:jahr/advisor/conversations/:id/model', async ({ request }) => {
        calls.push({ method: 'PUT', path: 'model', body: await request.json() })
        return HttpResponse.json({ ok: true }, { status: 200 })
      }),
      http.get('*/v1/steuerjahre/:jahr/advisor/models', () =>
        HttpResponse.json(
          {
            standard: { provider: 'google-genai', model: 'gemini-test' },
            models: [
              { provider: 'google-genai', model: 'gemini-test', label: 'Gemini', depths: [] },
              { provider: 'anthropic', model: 'claude-test', label: 'Claude', depths: [{ depth: 'gruendlich', samples: 9, costFactor: 2.5, firstWordSeconds: 4 }] },
            ],
          },
          { status: 200 },
        ),
      ),
    )
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    fireEvent.click(await screen.findByText('IT & Software'))
    await waitFor(() => expect(callTo('POST', 'antworten')?.body).toMatchObject({ questionId: 'beruf', value: 'IT & Software' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    fireEvent.click(await screen.findByTestId('advisor-model-picker'))
    fireEvent.click(screen.getByTestId('advisor-model-option-anthropic:claude-test'))
    await waitFor(() => expect(callTo('PUT', 'model')?.body).toEqual({ provider: 'anthropic', model: 'claude-test' }))
  })

  it('condenses the conversation from the context ring', async () => {
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('advisor-context-ring'))
    fireEvent.click(screen.getByTestId('advisor-context-summarize'))
    await waitFor(() => expect(callTo('POST', 'summarize')).toBeDefined())
  })

  it('dismisses a hint card and asks the owl about the connection again', async () => {
    recordRoutes()
    server.use(
      http.get('*/v1/steuerjahre/:jahr/eulen-karten', () =>
        HttpResponse.json(
          {
            cards: [
              {
                id: 'k1',
                fingerprint: 'fp-1',
                trigger: 'vorjahresvergleich',
                category: 'abruf_frage',
                title: 'Spenden wie im Vorjahr?',
                message: 'Im Vorjahr hattest du Spenden.',
                reason: 'weil es abzugsfähig ist.',
                amountEur: null,
                legalStatusDate: '01.01.2025',
                sourceTranslated: 'Sonderausgaben nach § 10b EStG',
              },
            ],
          },
          { status: 200 },
        ),
      ),
      http.post('*/v1/steuerjahre/:jahr/eulen-karten/:fp/verwerfen', ({ params }) => {
        calls.push({ method: 'POST', path: 'verwerfen', body: params.fp })
        return HttpResponse.json({ ok: true }, { status: 200 })
      }),
    )
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-hints-pill'))
    fireEvent.click(await screen.findByText('Stimmt nicht'))
    await waitFor(() => expect(callTo('POST', 'verwerfen')?.body).toBe('fp-1'))
  })

  it('shows a stored occupation group as a quiet line, and asks again for a value it does not know', async () => {
    recordRoutes()
    server.use(
      http.get('*/v1/steuerjahre/:jahr/interview', () =>
        HttpResponse.json({ answers: { beruf: 'Pflege & Gesundheit' }, nextStep: { kind: 'question', id: 'job' }, openItems: 3 }, { status: 200 }),
      ),
    )
    const known = renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    expect((await screen.findByTestId('beruf-summary')).textContent).toContain('Pflege & Gesundheit')
    known.unmount()

    server.use(
      http.get('*/v1/steuerjahre/:jahr/interview', () =>
        HttpResponse.json({ answers: { beruf: 'Astronaut' }, nextStep: { kind: 'question', id: 'job' }, openItems: 3 }, { status: 200 }),
      ),
    )
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-settings-btn'))
    expect(await screen.findByTestId('beruf-picker')).toBeDefined()
  })

  it('WEB-48 / NR-03: a session that cannot be read is a failure with a retry, never an empty chat', async () => {
    recordRoutes()
    let sessionCalls = 0
    server.use(
      http.get('*/v1/steuerjahre/:jahr/advisor/session', () => {
        sessionCalls += 1
        return sessionCalls === 1 ? HttpResponse.json({ message: 'down' }, { status: 500 }) : HttpResponse.json(session())
      }),
    )
    renderConnected()
    expect(await screen.findByTestId('fehler-zustand')).toBeDefined()
    expect(screen.queryByTestId('advisor-chat-input')).toBeNull()
    fireEvent.click(screen.getByTestId('fehler-erneut-versuchen'))
    expect(await screen.findByTestId('advisor-chat-input')).toBeDefined()
  })

  it('fails closed: every request answering 500 shows a failure and sends no write', async () => {
    const failing = failEveryRequest()
    renderConnected()
    await expectFailsClosed(failing)
  })

  it('offers a hint with two paths with both of them', async () => {
    recordRoutes()
    const path = (name: string, risk: string) => ({ name, amountEur: 100, description: 'Beschreibung', risk })
    server.use(
      http.get('*/v1/steuerjahre/:jahr/eulen-karten', () =>
        HttpResponse.json(
          {
            cards: [
              {
                id: 'k1',
                fingerprint: 'fp-1',
                trigger: 'rechtsaenderung',
                category: 'cockpit_proaktiv',
                title: 'Homeoffice oder Arbeitszimmer',
                message: 'Zwei Wege.',
                reason: 'weil.',
                amountEur: 300,
                legalStatusDate: '01.01.2025',
                sourceTranslated: 'EStG',
                paths: [path('Pauschale', 'sicher'), path('Arbeitszimmer', 'risiko')],
              },
              { id: 'k2', fingerprint: 'fp-2', trigger: 'vorjahresvergleich', category: 'abruf_frage', title: 'Mit einem Weg', message: 'Nur einer.', reason: 'weil.', amountEur: 5, legalStatusDate: '01.01.2025', sourceTranslated: 'EStG', paths: [path('Allein', 'sicher')] },
            ],
          },
          { status: 200 },
        ),
      ),
    )
    renderConnected()
    fireEvent.click(await screen.findByTestId('eule-hints-pill'))
    expect(await screen.findByText('Pauschale')).toBeDefined()
    expect(screen.getByText('Arbeitszimmer')).toBeDefined()
    expect(screen.queryByText('Allein')).toBeNull()
  })

  it('shows the owl as unreachable when the connection check fails, and hands the back button on', async () => {
    recordRoutes()
    server.use(http.get('*/v1/steuerjahre/:jahr/advisor/connection', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    const onBack = vi.fn()
    renderConnected({ onBack })
    expect(await screen.findByTestId('eule-connection-dot-bad')).toBeDefined()
    fireEvent.click(screen.getByLabelText('Zurück'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('shows the connection as being checked until the answer arrives', async () => {
    recordRoutes()
    server.use(http.get('*/v1/steuerjahre/:jahr/advisor/connection', () => new Promise(() => {})))
    renderConnected()
    expect(await screen.findByTestId('eule-connection-dot-idle')).toBeDefined()
  })

  it('says so when the rating was not stored', async () => {
    refuse.add('PUT feedback')
    refuse.add('POST feedback')
    recordRoutes()
    renderConnected()
    fireEvent.click(await screen.findByTestId('advisor-feedback-up'))
    expect(await screen.findByTestId('advisor-feedback-failed')).toBeDefined()
  })

  it('says so when a conversation could not be renamed, and when the conversation could not be cleared', async () => {
    refuse.add('PUT conversation')
    refuse.add('DELETE session')
    refuse.add('DELETE chat')
    recordRoutes()
    renderConnected()
    await screen.findByTestId('eule-project-sidebar')
    fireEvent.click(screen.getAllByTestId('eule-conversation-menu')[0]!)
    fireEvent.click(screen.getByTestId('eule-conversation-rename'))
    fireEvent.change(screen.getByTestId('eule-conversation-rename-input'), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByTestId('eule-conversation-rename-save'))
    expect(await screen.findByTestId('eule-conversation-failed')).toBeDefined()
    fireEvent.click(screen.getByTestId('eule-settings-btn'))
    fireEvent.click(screen.getByTestId('eule-clear-conversation-btn'))
    fireEvent.click(screen.getByTestId('eule-clear-confirm-btn'))
    expect(await screen.findByTestId('eule-clear-failed')).toBeDefined()
  })

  it('offers no model picker when the models cannot be listed', async () => {
    recordRoutes()
    server.use(http.get('*/v1/steuerjahre/:jahr/advisor/models', () => HttpResponse.json({ message: 'down' }, { status: 500 })))
    renderConnected()
    await screen.findByTestId('advisor-chat-input')
    expect(screen.queryByTestId('advisor-model-picker')).toBeNull()
  })
})
