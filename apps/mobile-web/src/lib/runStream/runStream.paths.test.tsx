import { describe, expect, it, vi } from 'vitest'
import { createSseDecoder, followRun, type RunFrame } from './runStream'

const frame = (id: number, event: string, data: unknown): string => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
const sse = (text: string, status = 200): Response => new Response(text, { status, headers: { 'content-type': 'text/event-stream' } })
const noSleep = async (): Promise<void> => {}
const START = frame(1, 'start', { runId: 'run-1' })

function collect() {
  const frames: RunFrame[] = []
  return { frames, onFrame: (f: RunFrame) => void frames.push(f) }
}

describe('createSseDecoder, odd input', () => {
  it('takes a frame without a usable sequence number and without an event name as a plain message', () => {
    const frames: RunFrame[] = []
    const decoder = createSseDecoder((f) => frames.push(f))
    decoder.push('id: abc\ndata: {"a":1}\r\n\r\ndata: {"b":\ndata: 2}\n\n')
    expect(frames).toEqual([
      { id: null, event: 'message', data: { a: 1 } },
      { id: null, event: 'message', data: { b: 2 } },
    ])
  })

  it('has nothing to say when it ends on silence', () => {
    const frames: RunFrame[] = []
    const decoder = createSseDecoder((f) => frames.push(f))
    decoder.push('   ')
    decoder.end()
    expect(frames).toEqual([])
  })
})

describe('followRun, the ways a run goes wrong', () => {
  it('hands back the refusal of the first request with its JSON body', async () => {
    const { onFrame } = collect()
    const result = await followRun({
      open: async () => new Response(JSON.stringify({ message: 'Kontingent erschöpft' }), { status: 429 }),
      resume: async () => sse(''),
      onFrame,
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'http-error', status: 429, body: { message: 'Kontingent erschöpft' } })
  })

  it('hands back a refusal whose body is empty or not JSON as having no body', async () => {
    for (const text of ['', '<html>Bad Gateway</html>']) {
      const result = await followRun({
        open: async () => new Response(text, { status: 502 }),
        resume: async () => sse(''),
        onFrame: () => {},
        signal: new AbortController().signal,
      })
      expect(result).toEqual({ kind: 'http-error', status: 502, body: null })
    }
  })

  it('treats a plain JSON answer as a finished turn', async () => {
    const { frames, onFrame } = collect()
    const result = await followRun({
      open: async () => new Response(JSON.stringify({ reply: 'fertig' }), { status: 200, headers: { 'content-type': 'application/json' } }),
      resume: async () => sse(''),
      onFrame,
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(frames).toEqual([{ id: null, event: 'done', data: { reply: 'fertig' } }])
  })

  it('reads a stream whose body cannot be read piece by piece', async () => {
    const { frames, onFrame } = collect()
    const response = sse(START + frame(2, 'done', {}))
    Object.defineProperty(response, 'body', { value: null })
    const result = await followRun({ open: async () => response, resume: async () => sse(''), onFrame, signal: new AbortController().signal })
    expect(result).toEqual({ kind: 'finished' })
    expect(frames.map((f) => f.event)).toEqual(['start', 'done'])
  })

  it('throws when the very first request fails before any run exists', async () => {
    await expect(
      followRun({ open: async () => Promise.reject(new Error('offline')), resume: async () => sse(''), onFrame: () => {}, signal: new AbortController().signal }),
    ).rejects.toThrow('offline')
  })

  it('reports an abort instead of an error when the caller stopped the first request', async () => {
    const controller = new AbortController()
    const result = await followRun({
      open: async () => {
        controller.abort()
        throw new Error('aborted')
      },
      resume: async () => sse(''),
      onFrame: () => {},
      signal: controller.signal,
    })
    expect(result).toEqual({ kind: 'aborted' })
  })

  it('re-attaches to a run it was told about when the first request fails', async () => {
    const { frames, onFrame } = collect()
    const resume = vi.fn(async (_runId: string, _after: number) => sse(frame(5, 'done', { ok: true })))
    const result = await followRun({
      runId: 'run-9',
      open: async () => Promise.reject(new Error('offline')),
      resume,
      onFrame,
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(resume).toHaveBeenCalledWith('run-9', 0)
    expect(frames).toHaveLength(1)
  })

  it('is lost, with no run to return to, when the stream ends without ever starting one', async () => {
    const result = await followRun({ open: async () => sse(': ping\n\n'), resume: async () => sse(''), onFrame: () => {}, signal: new AbortController().signal })
    expect(result).toEqual({ kind: 'lost', runId: null })
  })

  it('is aborted when the caller stops while the stream is open', async () => {
    const controller = new AbortController()
    const result = await followRun({
      open: async () => {
        const response = sse(START)
        controller.abort()
        return response
      },
      resume: async () => sse(''),
      onFrame: () => {},
      signal: controller.signal,
    })
    expect(result).toEqual({ kind: 'aborted' })
  })

  it('stops waiting to re-attach when the caller aborts during the pause', async () => {
    const controller = new AbortController()
    const resume = vi.fn(async () => sse(''))
    const result = await followRun({
      open: async () => sse(START),
      resume,
      onFrame: () => {},
      signal: controller.signal,
      sleep: async () => controller.abort(),
    })
    expect(result).toEqual({ kind: 'aborted' })
    expect(resume).not.toHaveBeenCalled()
  })

  it('is lost when the server no longer knows the run', async () => {
    const result = await followRun({ open: async () => sse(START), resume: async () => new Response('', { status: 404 }), onFrame: () => {}, signal: new AbortController().signal, sleep: noSleep })
    expect(result).toEqual({ kind: 'lost', runId: 'run-1' })
  })

  it('keeps trying through refusals and failures, tells how often, and gives up after the limit', async () => {
    const attempts: number[] = []
    let calls = 0
    const result = await followRun({
      open: async () => sse(START),
      resume: async () => {
        calls += 1
        if (calls % 2 === 0) throw new Error('offline')
        return new Response('', { status: 503 })
      },
      onFrame: () => {},
      onReconnecting: (attempt) => attempts.push(attempt),
      maxReconnects: 3,
      delayMs: () => 0,
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'lost', runId: 'run-1' })
    expect(attempts).toEqual([1, 2, 3])
    expect(calls).toBe(3)
  })

  it('stops quietly when a failing re-attach was caused by the caller aborting', async () => {
    const controller = new AbortController()
    const result = await followRun({
      open: async () => sse(START),
      resume: async () => {
        controller.abort()
        throw new Error('aborted')
      },
      onFrame: () => {},
      signal: controller.signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'aborted' })
  })

  it('uses a growing pause between attempts by default', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const pending = followRun({ open: async () => sse(START), resume: async () => new Response('', { status: 404 }), onFrame: () => {}, signal: controller.signal })
      await vi.advanceTimersByTimeAsync(400)
      expect(await pending).toEqual({ kind: 'lost', runId: 'run-1' })
    } finally {
      vi.useRealTimers()
    }
  })
})
