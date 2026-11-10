import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CopilotBridgeProvider, useCopilotBridge, type CopilotMode, type StreamOutcome } from './CopilotBridgeProvider'

const encoder = new TextEncoder()
const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

/** A stream that delivers the given events and then stays open until the client aborts. */
function hangingStream(events: Array<[string, unknown]>, onAbort: () => void): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of events) controller.enqueue(sse(event, data))
    },
    cancel() {
      onAbort()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}

function Harness({ children }: { readonly children: React.ReactNode }) {
  const [mode, setMode] = useState<CopilotMode>('eulen-modus')
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
      <button data-testid="stop" onClick={() => bridge.stopStreaming()} />
      <span data-testid="streaming">{String(bridge.streaming)}</span>
      <span data-testid="text">{bridge.streamedText}</span>
      <span data-testid="aborted">{bridge.abortedTurn ? `${bridge.abortedTurn.question}|${bridge.abortedTurn.partialText}` : 'none'}</span>
      <span data-testid="error">{bridge.chatError ?? 'none'}</span>
    </div>
  )
}

describe('CopilotBridge stop (#451 slice 1, decision 2)', () => {
  it('aborts the request, keeps the partial answer as aborted and reports no error', async () => {
    // MSW in Node does not forward the abort to the handler, so watch the signal the client hands to fetch.
    const realFetch = globalThis.fetch
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/advisor/stream')) requestSignal = init?.signal ?? undefined
      return realFetch(input, init)
    })
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        hangingStream(
          [
            ['status', { text: 'Eule prüft deine Akte & Paragraphen …' }],
            ['token', { text: 'Du kannst bis zu ' }],
          ],
          () => {},
        ),
      ),
    )
    outcome = 'pending'
    render(
      <Harness>
        <Probe />
      </Harness>,
    )

    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Du kannst bis zu '))
    expect(screen.getByTestId('streaming').textContent).toBe('true')

    act(() => screen.getByTestId('stop').click())

    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('false'))
    expect(screen.getByTestId('aborted').textContent).toBe('Wie viel Homeoffice?|Du kannst bis zu ')
    expect(screen.getByTestId('error').textContent).toBe('none')
    expect(outcome).toBe('aborted')
    expect(requestSignal?.aborted).toBe(true)
    vi.unstubAllGlobals()
  })

  it('never offers a proposal from an aborted turn, even one whose action event already arrived', async () => {
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () =>
        hangingStream(
          [
            ['token', { text: 'Ich schlage vor …' }],
            ['action', { actionId: 'act-half-1', screen: 'interview', field: 'homeoffice', newValue: '60' }],
          ],
          () => {},
        ),
      ),
    )
    outcome = 'pending'
    render(
      <Harness>
        <Probe />
      </Harness>,
    )

    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Ich schlage vor …'))
    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(outcome).toBe('aborted'))
    // The aborted turn is never persisted, so it carries only text: no action can be applied from it.
    expect(screen.getByTestId('aborted').textContent).toBe('Wie viel Homeoffice?|Ich schlage vor …')
  })

  it('clears an aborted turn when the next question is sent', async () => {
    let calls = 0
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', () => {
        calls += 1
        return hangingStream([['token', { text: `Antwort ${calls}` }]], () => {})
      }),
    )
    render(
      <Harness>
        <Probe />
      </Harness>,
    )
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Antwort 1'))
    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(screen.getByTestId('aborted').textContent).not.toBe('none'))

    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('aborted').textContent).toBe('none'))
    act(() => screen.getByTestId('stop').click())
  })
})
