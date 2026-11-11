import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CopilotBridgeProvider, useCopilotBridge, type CopilotMode, type StreamOutcome } from './CopilotBridgeProvider'

const encoder = new TextEncoder()
const frame = (id: number, event: string, data: unknown): Uint8Array => encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
const SSE = { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }

const USER_MESSAGE = { id: 'm1', role: 'user', content: 'Wie viel Homeoffice?', meta: null, createdAt: '2026-11-11T10:00:00.000Z', status: 'complete' }
const START = { runId: 'run-1', userMessage: USER_MESSAGE, assistantMessageId: 'm2' }
const DONE = {
  userMessage: USER_MESSAGE,
  assistantMessage: { id: 'm2', role: 'assistant', content: 'Bis zu 210 Tage.', meta: null, createdAt: '2026-11-11T10:00:01.000Z', status: 'complete' },
  mode: 'langgraph',
}

function closedStream(frames: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(f)
      controller.close()
    },
  }), SSE)
}

/**
 * A connection that ends before the answer does (a proxy timeout, a phone changing networks): the
 * stream closes without a `done` event. A mid-read network error is covered in runStream.test.tsx.
 */
const droppedStream = closedStream

/** Delivers the frames and stays open until the client leaves. */
function openStream(frames: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(f)
    },
  }), SSE)
}

function Harness({ children }: { readonly children: React.ReactNode }) {
  const [mode, setMode] = useState<CopilotMode>('eulen-modus')
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CopilotBridgeProvider mode={mode} onModeChange={setMode} taxYear={2025}>
            {children}
          </CopilotBridgeProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

let outcome: StreamOutcome | 'pending' = 'pending'

function Probe() {
  const bridge = useCopilotBridge()
  return (
    <div>
      <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Wie viel Homeoffice?').then((o) => (outcome = o))} />
      <button data-testid="resume" onClick={() => void bridge.resumeRun('run-7').then((o) => (outcome = o))} />
      <button data-testid="stop" onClick={() => bridge.stopStreaming()} />
      <span data-testid="streaming">{String(bridge.streaming)}</span>
      <span data-testid="text">{bridge.streamedText}</span>
      <span data-testid="reasoning">{bridge.streamedReasoning}</span>
      <span data-testid="pending">{bridge.pendingUserMessage?.content ?? 'none'}</span>
      <span data-testid="error">{bridge.chatError ?? 'none'}</span>
    </div>
  )
}

function mount() {
  outcome = 'pending'
  render(
    <Harness>
      <Probe />
    </Harness>,
  )
}

afterEach(() => {
  outcome = 'pending'
})

describe('CopilotBridge: answers survive the connection (#476)', () => {
  it('re-attaches after a dropped connection with Last-Event-ID and shows the whole answer once', async () => {
    const lastEventIds: Array<string | null> = []
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => droppedStream([frame(1, 'start', START), frame(2, 'token', { text: 'Bis zu ' })])),
      http.get('*/v1/steuerjahre/2025/advisor/runs/run-1/events', ({ request }) => {
        lastEventIds.push(request.headers.get('last-event-id'))
        return closedStream([frame(2, 'token', { text: 'Bis zu ' }), frame(3, 'token', { text: '210 Tage.' }), frame(4, 'done', DONE)])
      }),
    )
    mount()
    act(() => screen.getByTestId('send').click())

    await waitFor(() => expect(outcome).not.toBe('pending'), { timeout: 5000 })
    expect(lastEventIds).toEqual(['2'])
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(Array.isArray(outcome) && outcome.map((m) => m.content)).toEqual(['Wie viel Homeoffice?', 'Bis zu 210 Tage.'])
  })

  it('shows the question from the first event and the reasoning apart from the answer', async () => {
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        openStream([
          frame(1, 'start', START),
          frame(2, 'reasoning', { text: 'Erst die Pauschale ' }),
          frame(3, 'reasoning', { text: 'prüfen.' }),
          frame(4, 'token', { text: 'Bis zu ' }),
        ]),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/runs/run-1/stop', () => HttpResponse.json({ stopped: true })),
    )
    mount()
    act(() => screen.getByTestId('send').click())

    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Bis zu '))
    expect(screen.getByTestId('reasoning').textContent).toBe('Erst die Pauschale prüfen.')
    expect(screen.getByTestId('pending').textContent).toBe('Wie viel Homeoffice?')
    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(outcome).toBe('aborted'))
  })

  it('tells the server to stop the run when the user presses Stop', async () => {
    const stopped: string[] = []
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => openStream([frame(1, 'start', START), frame(2, 'token', { text: 'Bis zu ' })])),
      http.post('*/v1/steuerjahre/2025/advisor/runs/:runId/stop', ({ params }) => {
        stopped.push(String(params.runId))
        return HttpResponse.json({ stopped: true })
      }),
    )
    mount()
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Bis zu '))

    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(stopped).toEqual(['run-1']))
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('false'))
    expect(outcome).toBe('aborted')
  })

  it('finds the running answer through the session when Stop comes before the first event', async () => {
    const stopped: string[] = []
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => openStream([])),
      http.get('*/v1/steuerjahre/2025/advisor/session', () =>
        HttpResponse.json({
          enabled: true, greeting: '', openCards: [], quickChips: [], legalSources: [],
          messages: [USER_MESSAGE, { id: 'm2', role: 'assistant', content: '', meta: null, createdAt: '2026-11-11T10:00:01.000Z', status: 'streaming', runId: 'run-early' }],
        }),
      ),
      http.post('*/v1/steuerjahre/2025/advisor/runs/:runId/stop', ({ params }) => {
        stopped.push(String(params.runId))
        return HttpResponse.json({ stopped: true })
      }),
    )
    mount()
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('true'))
    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(stopped).toEqual(['run-early']))
  })

  it('follows an answer that was found still running, from its first event', async () => {
    const lastEventIds: Array<string | null> = []
    server.use(
      http.get('*/v1/steuerjahre/2025/advisor/runs/run-7/events', ({ request }) => {
        lastEventIds.push(request.headers.get('last-event-id'))
        return closedStream([frame(1, 'start', { ...START, runId: 'run-7' }), frame(2, 'token', { text: 'Bis zu 210 Tage.' }), frame(3, 'done', DONE)])
      }),
    )
    mount()
    act(() => screen.getByTestId('resume').click())
    await waitFor(() => expect(Array.isArray(outcome)).toBe(true))
    expect(lastEventIds).toEqual([null])

    // A second attempt for the same run is refused, so a broken run cannot loop.
    outcome = 'pending'
    act(() => screen.getByTestId('resume').click())
    await waitFor(() => expect(outcome).toBeNull())
    expect(lastEventIds).toHaveLength(1)
  })

  it('says so when the run is gone, and leaves the outcome to the stored conversation', async () => {
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => droppedStream([frame(1, 'start', START), frame(2, 'token', { text: 'Bis zu ' })])),
      http.get('*/v1/steuerjahre/2025/advisor/runs/run-1/events', () => HttpResponse.json({ code: 'ADVISOR_RUN_NOT_FOUND' }, { status: 404 })),
    )
    mount()
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(outcome).toBeNull(), { timeout: 5000 })
    expect(screen.getByTestId('error').textContent).toContain('Verbindung ist abgerissen')
    expect(screen.getByTestId('streaming').textContent).toBe('false')
  })
})
