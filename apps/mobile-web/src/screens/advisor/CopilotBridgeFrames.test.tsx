// What the bridge makes of the frames of an answer, including the odd ones: a frame it cannot read
// must neither crash the chat nor leave the user without words.
import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { CopilotBridgeHarness } from '../../../test/test-advisor'
import { useCopilotBridge } from './CopilotBridgeProvider'

const frame = (id: number, event: string, data: unknown) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function answerWith(frames: string, status = 200) {
  server.use(
    http.post('*/v1/steuerjahre/:jahr/advisor/stream', () =>
      new HttpResponse(frames, { status, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }),
    ),
  )
}

function Probe() {
  const bridge = useCopilotBridge()
  return (
    <div>
      <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Frage', undefined, { skill: 'berater-interview', turbo: true, depth: 'max' })} />
      <button data-testid="send-plain" onClick={() => void bridge.sendStreamingMessage('Frage')} />
      <span data-testid="error">{bridge.chatError ?? 'none'}</span>
      <span data-testid="text">{bridge.streamedText}</span>
      <span data-testid="reasoning">{bridge.streamedReasoning}</span>
      <span data-testid="steps">{bridge.streamSteps.map((s) => `${s.kind}:${s.label}:${s.result ?? ''}:${s.ok ?? ''}`).join('|')}</span>
      <span data-testid="plan">{bridge.plan ? `${bridge.plan.finished ? 'done' : 'open'}:${bridge.plan.steps.map((s) => `${s.text}=${s.status}`).join(',')}` : 'none'}</span>
      <span data-testid="view">{bridge.owlViewMode.kind === 'mask' ? `mask:${bridge.owlViewMode.screen}:${'field' in bridge.owlViewMode ? bridge.owlViewMode.field : ''}` : bridge.owlViewMode.kind}</span>
      <span data-testid="basis">{String(bridge.basisMode)}</span>
      <span data-testid="streaming">{String(bridge.streaming)}</span>
    </div>
  )
}

function mount() {
  render(
    <CopilotBridgeHarness>
      <Probe />
    </CopilotBridgeHarness>,
  )
}

async function send(testId = 'send') {
  act(() => screen.getByTestId(testId).click())
  await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('false'))
}

describe('the frames of an answer', () => {
  it('shows steps, a plan and the reasoning while the answer runs, and the mask the owl opens', async () => {
    answerWith(
      frame(1, 'start', { runId: 'run-1', userMessage: { id: 'u1', role: 'user', content: 'Frage', meta: null, createdAt: '2026-11-14T10:00:00.000Z' } }) +
        frame(2, 'status', { text: 'Prüfe Akte …' }) +
        frame(3, 'tool', { name: 'lookup_legal_source', label: 'Schlage nach …' }) +
        frame(4, 'tool', { label: 'Ohne Namen …' }) +
        frame(5, 'tool_result', { name: 'lookup_legal_source', ok: true, result: '§ 9 EStG' }) +
        frame(6, 'tool_result', { result: 42 }) +
        frame(7, 'reasoning', { text: 'Erst prüfen.' }) +
        frame(8, 'plan', { steps: [{ text: 'Prüfen', status: 'laeuft' }, { text: 'Fertig', status: 'erledigt' }, { text: 'Unklar', status: 'kaputt' }, 'kein Objekt', null] }) +
        frame(9, 'ui_command', { openMask: 'lstb', focus: 'bruttoarbeitslohn' }) +
        frame(10, 'ui_command', { openMask: 'rente' }) +
        frame(11, 'plan', { steps: 'kaputt' }) +
        frame(12, 'plan', { nichts: true }) +
        frame(13, 'token', { text: 'Hallo' }) +
        frame(14, 'token', { kein: 'text' }) +
        frame(15, 'done', { mode: 'deterministic_fallback' }),
    )
    mount()
    await send()
    expect(screen.getByTestId('steps').textContent).toContain('Ohne Namen')
    expect(screen.getByTestId('plan').textContent).toBe('done:Prüfen=laeuft,Fertig=erledigt')
    expect(screen.getByTestId('view').textContent).toBe('mask:rente:')
    expect(screen.getByTestId('basis').textContent).toBe('true')
  })

  it('opens a mask at the field the owl names', async () => {
    answerWith(frame(1, 'ui_command', { openMask: 'lstb', focus: 'bruttoarbeitslohn' }) + frame(2, 'done', { mode: 'llm' }))
    mount()
    await send('send-plain')
    expect(screen.getByTestId('view').textContent).toBe('mask:lstb:bruttoarbeitslohn')
  })

  it('says why the owl could not answer in her own words, or plainly when she gave none', async () => {
    answerWith(frame(1, 'error', { message: 'Das Modell ist gerade nicht erreichbar.' }))
    mount()
    await send()
    expect(screen.getByTestId('error').textContent).toContain('Das Modell ist gerade nicht erreichbar.')
    expect(screen.getByTestId('text').textContent).toBe('')

    answerWith(frame(1, 'error', { code: 'x' }))
    await send()
    expect(screen.getByTestId('error').textContent).not.toBe('none')
  })

  it('says it in words when the request is refused, with or without words of the server', async () => {
    // The owl's daily limit is a DomainError with a German message: it is said as the server says it.
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/stream', () => HttpResponse.json({ code: 'ADVISOR_DAILY_LIMIT_EXCEEDED', message: 'Tageslimit erreicht.' }, { status: 429 })))
    mount()
    await send()
    expect(screen.getByTestId('error').textContent).toContain('Tageslimit erreicht.')

    // WEB-14: a throttler 429 without a code carries English text; the shared wording reads Retry-After instead.
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/stream', () => HttpResponse.json({ message: 'ThrottlerException: Too Many Requests' }, { status: 429 })))
    await send()
    expect(screen.getByTestId('error').textContent).toBe('Gerade kommen zu viele Anfragen. Versuch es in ein paar Minuten noch mal.')

    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/stream', () => new HttpResponse('', { status: 500 })))
    await send()
    expect(screen.getByTestId('error').textContent).not.toBe('none')
    expect(screen.getByTestId('error').textContent).not.toContain('Tageslimit')
  })

  it('says the connection was lost when the stream ends before the owl finished and the run is unknown', async () => {
    answerWith(': nur ein Herzschlag\n\n')
    mount()
    await send()
    expect(screen.getByTestId('error').textContent).not.toBe('none')
  })

  it('shows the failure of a request that cannot be sent at all', async () => {
    server.use(http.post('*/v1/steuerjahre/:jahr/advisor/stream', () => HttpResponse.error()))
    mount()
    await send()
    expect(screen.getByTestId('error').textContent).not.toBe('none')
  })
})
