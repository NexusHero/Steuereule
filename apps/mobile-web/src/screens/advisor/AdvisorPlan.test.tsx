import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { ThemeProvider } from '@steuereule/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http } from 'msw'
import { createAppI18n } from '../../i18n/app-i18n'
import { server } from '../../test-msw-server'
import { AdvisorChatPanel, type AdvisorChatPanelProps } from './AdvisorChatPanel'
import { abortPlan, CopilotBridgeProvider, useCopilotBridge, type CopilotMode } from './CopilotBridgeProvider'
import { renderInApp } from '../../test-render'

const encoder = new TextEncoder()
const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

function Providers({ children }: { readonly children: React.ReactNode }) {
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

function renderPanel(props: Partial<AdvisorChatPanelProps>) {
  return renderInApp(<AdvisorChatPanel messages={[]} onSendMessage={vi.fn()} {...props} />)
}

describe('plan checklist (#451 slice 6, AC 11–14)', () => {
  it('shows each step with its live status while the owl works', () => {
    renderPanel({
      isSending: true,
      plan: {
        finished: false,
        steps: [
          { text: 'Arbeitsweg prüfen', status: 'erledigt' },
          { text: 'Spenden prüfen', status: 'laeuft' },
          { text: 'Belege prüfen', status: 'offen' },
        ],
      },
    })
    expect(screen.getByTestId('advisor-plan-step-1').textContent).toContain('✓')
    expect(screen.getByTestId('advisor-plan-step-2').textContent).toContain('◐')
    expect(screen.getByTestId('advisor-plan-step-3').textContent).toContain('○')
    expect(screen.queryByTestId('advisor-plan-toggle')).toBeNull()
  })

  it('collapses to „N Schritte erledigt ▸“ above the answer once finished, and expands on click', () => {
    renderPanel({
      messages: [
        { id: 'u1', role: 'user', content: 'Was hab ich vergessen?', meta: null, createdAt: '2026-11-10T10:00:00Z' },
        { id: 'a1', role: 'assistant', content: 'Spenden fehlen noch.', meta: null, createdAt: '2026-11-10T10:00:05Z' },
      ],
      plan: { finished: true, steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Spenden prüfen', status: 'erledigt' }] },
    })
    expect(screen.getByTestId('advisor-plan-toggle').textContent).toContain('2 Schritte erledigt ▸')
    expect(screen.queryByTestId('advisor-plan-step-1')).toBeNull()
    fireEvent.click(screen.getByTestId('advisor-plan-toggle'))
    expect(screen.getByTestId('advisor-plan-step-1')).toBeTruthy()
  })

  it('keeps a stopped plan open so the done and the cut-off steps stay visible', () => {
    renderPanel({
      abortedTurn: { question: 'Prüf alles', partialText: '' },
      plan: { finished: true, steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Riester prüfen', status: 'abgebrochen' }] },
    })
    expect(screen.queryByTestId('advisor-plan-toggle')).toBeNull()
    expect(screen.getByTestId('advisor-plan-step-1').textContent).toContain('✓')
    expect(screen.getByTestId('advisor-plan-step-2').textContent).toContain('abgebrochen')
  })

  it('marks the running step as aborted on Stop and keeps finished ones', () => {
    expect(
      abortPlan({
        finished: false,
        steps: [
          { text: 'a', status: 'erledigt' },
          { text: 'b', status: 'laeuft' },
          { text: 'c', status: 'offen' },
        ],
      }),
    ).toEqual({
      finished: true,
      steps: [
        { text: 'a', status: 'erledigt' },
        { text: 'b', status: 'abgebrochen' },
        { text: 'c', status: 'offen' },
      ],
    })
  })

  it('sends the quick start with quickAction forgotten_check and follows the plan events live', async () => {
    let sentBody: unknown = null
    let push: ((event: string, data: unknown) => void) | null = null
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', async ({ request }) => {
        sentBody = await request.json()
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            push = (event, data) => controller.enqueue(sse(event, data))
          },
        })
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }),
    )
    function Probe() {
      const bridge = useCopilotBridge()
      return (
        <>
          <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Was hab ich vergessen?', undefined, { quickAction: 'forgotten_check' })} />
          <button data-testid="stop" onClick={() => bridge.stopStreaming()} />
          <span data-testid="plan">{JSON.stringify(bridge.plan)}</span>
        </>
      )
    }
    render(
      <Providers>
        <Probe />
      </Providers>,
    )
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(push).not.toBeNull())
    expect(sentBody).toEqual({ message: 'Was hab ich vergessen?', quickAction: 'forgotten_check' })

    act(() => push!('plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'laeuft' }, { text: 'Spenden prüfen', status: 'offen' }] }))
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toContain('"status":"laeuft"'))
    act(() => push!('plan', { steps: [{ text: 'Arbeitsweg prüfen', status: 'erledigt' }, { text: 'Spenden prüfen', status: 'laeuft' }] }))
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toContain('"status":"erledigt"'))

    act(() => screen.getByTestId('stop').click())
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toContain('"status":"abgebrochen"'))
    expect(JSON.parse(screen.getByTestId('plan').textContent!)).toEqual({
      finished: true,
      steps: [
        { text: 'Arbeitsweg prüfen', status: 'erledigt' },
        { text: 'Spenden prüfen', status: 'abgebrochen' },
      ],
    })
  })

  it('sends replaceFromMessageId when an answer is regenerated or a question edited (#451 slice 1b)', async () => {
    let sentBody: unknown = null
    server.use(
      http.post('*/v1/steuerjahre/2025/advisor/stream', async ({ request }) => {
        sentBody = await request.json()
        return new Response(sse('done', { mode: 'langgraph', userMessage: null, assistantMessage: null }), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }),
    )
    function Probe() {
      const bridge = useCopilotBridge()
      return <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Und 350 €?', undefined, { replaceFromMessageId: 'u2' })} />
    }
    render(
      <Providers>
        <Probe />
      </Providers>,
    )
    act(() => screen.getByTestId('send').click())
    await waitFor(() => expect(sentBody).toEqual({ message: 'Und 350 €?', replaceFromMessageId: 'u2' }))
  })
})
