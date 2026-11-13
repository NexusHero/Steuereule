// #503 — conversations answer side by side: every conversation has its own answer, and what is
// streamed, stopped or failed in one never shows in another.
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { CopilotBridgeProvider, useCopilotBridge, type CopilotMode } from './CopilotBridgeProvider'

const encoder = new TextEncoder()
const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

/** Delivers the events and stays open until the client aborts. */
function hangingStream(events: Array<[string, unknown]>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [event, data] of events) controller.enqueue(sse(event, data))
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}

function Harness({ children, onSwitchYear }: { readonly children: React.ReactNode; readonly onSwitchYear?: (year: number) => void }) {
  const [mode, setMode] = useState<CopilotMode>('eulen-modus')
  const [year, setYear] = useState(2025)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={createAppI18n('de')}>
        <ThemeProvider mode="light">
          <CopilotBridgeProvider
            mode={mode}
            onModeChange={setMode}
            taxYear={year}
            onSwitchYear={(next) => {
              onSwitchYear?.(next)
              setYear(next)
            }}
          >
            {children}
            <button data-testid="year-outside" onClick={() => setYear(2023)} />
          </CopilotBridgeProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function Probe() {
  const bridge = useCopilotBridge()
  return (
    <div>
      <button data-testid="open-a" onClick={() => bridge.setConversationId('conv-a')} />
      <button data-testid="open-b" onClick={() => bridge.setConversationId('conv-b')} />
      <button data-testid="open-other-year" onClick={() => bridge.openConversationInYear(2024, 'conv-2024')} />
      <button data-testid="adopt" onClick={() => bridge.adoptConversationId('conv-adopted')} />
      <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Frage')} />
      <button data-testid="stop" onClick={() => bridge.stopStreaming()} />
      <span data-testid="conversation">{bridge.conversationId ?? 'none'}</span>
      <span data-testid="year">{bridge.taxYear}</span>
      <span data-testid="streaming">{String(bridge.streaming)}</span>
      <span data-testid="text">{bridge.streamedText}</span>
      <span data-testid="aborted">{bridge.abortedTurn ? bridge.abortedTurn.partialText : 'none'}</span>
      <span data-testid="answering">{[...bridge.answeringConversationIds].sort().join(',')}</span>
    </div>
  )
}

/** Answers every stream request with the text the conversation in its body asks for. */
function answerPerConversation(texts: Readonly<Record<string, string>>) {
  server.use(
    http.post('*/v1/steuerjahre/:jahr/advisor/stream', async ({ request }) => {
      const body = (await request.json()) as { conversationId?: string }
      return hangingStream([['token', { text: texts[body.conversationId ?? ''] ?? 'ohne Gespräch ' }]])
    }),
  )
}

describe('conversations answer side by side (#503)', () => {
  it('keeps each answer in its own conversation while both are being written', async () => {
    answerPerConversation({ 'conv-a': 'Antwort A ', 'conv-b': 'Antwort B ' })
    render(
      <Harness>
        <Probe />
      </Harness>,
    )

    act(() => screen.getByTestId('open-a').click())
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Antwort A '))

    // The other conversation is free while the first one answers.
    act(() => screen.getByTestId('open-b').click())
    expect(screen.getByTestId('streaming').textContent).toBe('false')
    expect(screen.getByTestId('text').textContent).toBe('')
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Antwort B '))
    expect(screen.getByTestId('answering').textContent).toBe('conv-a,conv-b')

    // Back in the first one its answer is still there and still running.
    act(() => screen.getByTestId('open-a').click())
    expect(screen.getByTestId('text').textContent).toBe('Antwort A ')
    expect(screen.getByTestId('streaming').textContent).toBe('true')
  })

  it('stops only the answer of the conversation that is open', async () => {
    vi.stubGlobal('fetch', ((realFetch) => (input: RequestInfo | URL, init?: RequestInit) => realFetch(input, init))(globalThis.fetch))
    answerPerConversation({ 'conv-a': 'Antwort A ', 'conv-b': 'Antwort B ' })
    render(
      <Harness>
        <Probe />
      </Harness>,
    )
    act(() => screen.getByTestId('open-a').click())
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Antwort A '))
    act(() => screen.getByTestId('open-b').click())
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('Antwort B '))

    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('false'))
    expect(screen.getByTestId('aborted').textContent).toBe('Antwort B ')
    expect(screen.getByTestId('answering').textContent).toBe('conv-a')

    act(() => screen.getByTestId('open-a').click())
    expect(screen.getByTestId('streaming').textContent).toBe('true')
    expect(screen.getByTestId('aborted').textContent).toBe('none')
    vi.unstubAllGlobals()
  })

  it('moves an answer asked before the conversation was known to that conversation', async () => {
    answerPerConversation({})
    render(
      <Harness>
        <Probe />
      </Harness>,
    )
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(screen.getByTestId('text').textContent).toBe('ohne Gespräch '))
    act(() => screen.getByTestId('adopt').click())
    // Adopting files the answer, it does not choose the conversation: the session is not loaded again.
    expect(screen.getByTestId('conversation').textContent).toBe('none')
    expect(screen.getByTestId('text').textContent).toBe('ohne Gespräch ')
    expect(screen.getByTestId('streaming').textContent).toBe('true')
    expect(screen.getByTestId('answering').textContent).toBe('conv-adopted')
  })
})

describe('tax years as projects (#503)', () => {
  it('opening a conversation of another year switches the app to that year and keeps the conversation', () => {
    const onSwitchYear = vi.fn()
    render(
      <Harness onSwitchYear={onSwitchYear}>
        <Probe />
      </Harness>,
    )
    act(() => screen.getByTestId('open-other-year').click())
    expect(onSwitchYear).toHaveBeenCalledWith(2024)
    expect(screen.getByTestId('year').textContent).toBe('2024')
    expect(screen.getByTestId('conversation').textContent).toBe('conv-2024')
  })

  it('a year changed elsewhere in the app drops the open conversation: it belongs to the other year', () => {
    render(
      <Harness>
        <Probe />
      </Harness>,
    )
    act(() => screen.getByTestId('open-a').click())
    act(() => screen.getByTestId('year-outside').click())
    expect(screen.getByTestId('year').textContent).toBe('2023')
    expect(screen.getByTestId('conversation').textContent).toBe('none')
  })
})
