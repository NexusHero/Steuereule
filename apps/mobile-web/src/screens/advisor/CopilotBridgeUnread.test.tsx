// The end of a run tells the navigation: a finished answer marks the owl while it is off screen, a
// refused request does not (nothing new waits there, and its error is shown where the user asked).
import { afterEach, describe, expect, it } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { CopilotBridgeHarness } from '../../../test/test-advisor'
import { useCopilotBridge } from './CopilotBridgeProvider'
import { resetOwlUnread, setOwlVisible, useOwlUnread } from './owlUnread'

const frame = (id: number, event: string, data: unknown) => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function answerWith(frames: string, status = 200) {
  server.use(http.post('*/v1/steuerjahre/:jahr/advisor/stream', () => new HttpResponse(frames, { status, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })))
}

function Probe() {
  const bridge = useCopilotBridge()
  return (
    <div>
      <button data-testid="send" onClick={() => void bridge.sendStreamingMessage('Frage')} />
      <span data-testid="streaming">{String(bridge.streaming)}</span>
      <span data-testid="sent">{bridge.streamedText}</span>
    </div>
  )
}

async function sendAndWait() {
  render(
    <CopilotBridgeHarness>
      <Probe />
    </CopilotBridgeHarness>,
  )
  act(() => screen.getByTestId('send').click())
  await waitFor(() => expect(screen.getByTestId('streaming').textContent).toBe('false'))
}

const ANSWER = frame(1, 'start', { runId: 'run-1' }) + frame(2, 'token', { text: 'Hallo' }) + frame(3, 'done', {})

afterEach(() => resetOwlUnread())

describe('the end of a run and the owl’s mark in the navigation', () => {
  it('a finished answer marks the owl while the user is on another tab', async () => {
    const unread = renderHook(() => useOwlUnread())
    answerWith(ANSWER)
    await sendAndWait()
    await waitFor(() => expect(unread.result.current).toBe(true))
  })

  it('a finished answer the user watches arrive marks nothing', async () => {
    const unread = renderHook(() => useOwlUnread())
    act(() => setOwlVisible(true))
    answerWith(ANSWER)
    await sendAndWait()
    expect(unread.result.current).toBe(false)
  })

  it('a refused request marks nothing', async () => {
    const unread = renderHook(() => useOwlUnread())
    answerWith('', 429)
    await sendAndWait()
    expect(unread.result.current).toBe(false)
  })
})
