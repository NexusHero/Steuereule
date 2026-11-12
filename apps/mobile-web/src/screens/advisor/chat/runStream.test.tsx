import { describe, expect, it } from 'vitest'
import { createSseDecoder, followRun, type RunFrame } from './runStream'

const frame = (id: number, event: string, data: unknown): string => `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function sse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/event-stream; charset=utf-8' } })
}

/** A response whose body delivers the given text and then breaks, like a dropped connection. */
function brokenSse(text: string): Response {
  // Erroring right after enqueue would discard the queued text; the break comes on the next read.
  let delivered = false
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (delivered) {
        controller.error(new Error('network down'))
        return
      }
      delivered = true
      controller.enqueue(new TextEncoder().encode(text))
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const START = frame(1, 'start', { runId: 'run-1', assistantMessageId: 'm2' })
const noSleep = async (): Promise<void> => {}

describe('createSseDecoder', () => {
  it('assembles frames from arbitrary pieces and reads their sequence number', () => {
    const frames: RunFrame[] = []
    const decoder = createSseDecoder((f) => frames.push(f))
    const text = frame(1, 'token', { text: 'Hal' }) + frame(2, 'token', { text: 'lo' })
    for (const piece of [text.slice(0, 7), text.slice(7, 31), text.slice(31)]) decoder.push(piece)
    decoder.end()
    expect(frames).toEqual([
      { id: 1, event: 'token', data: { text: 'Hal' } },
      { id: 2, event: 'token', data: { text: 'lo' } },
    ])
  })

  it('skips heartbeats and frames that are not JSON', () => {
    const frames: RunFrame[] = []
    const decoder = createSseDecoder((f) => frames.push(f))
    decoder.push(`: ping\n\nevent: token\ndata: not json\n\n${frame(3, 'done', {})}`)
    expect(frames).toEqual([{ id: 3, event: 'done', data: {} }])
  })

  it('reads a last frame that lacks the closing blank line', () => {
    const frames: RunFrame[] = []
    const decoder = createSseDecoder((f) => frames.push(f))
    decoder.push('event: done\ndata: {"ok":true}')
    decoder.end()
    expect(frames).toEqual([{ id: null, event: 'done', data: { ok: true } }])
  })
})

describe('followRun (#476)', () => {
  it('reads a run from start to done', async () => {
    const seen: string[] = []
    const result = await followRun({
      open: async () => sse(START + frame(2, 'token', { text: 'a' }) + frame(3, 'done', {})),
      resume: async () => {
        throw new Error('must not resume')
      },
      onFrame: (f) => seen.push(f.event),
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(seen).toEqual(['start', 'token', 'done'])
  })

  it('re-attaches after a broken connection with the last sequence number and delivers every event once', async () => {
    const tokens: string[] = []
    const resumes: Array<[string, number]> = []
    const result = await followRun({
      open: async () => brokenSse(START + frame(2, 'token', { text: 'Eins ' })),
      resume: async (runId, afterSeq) => {
        resumes.push([runId, afterSeq])
        // The server replays generously; the overlap must not show up twice.
        return sse(frame(2, 'token', { text: 'Eins ' }) + frame(3, 'token', { text: 'Zwei' }) + frame(4, 'done', {}))
      },
      onFrame: (f) => f.event === 'token' && tokens.push((f.data as { text: string }).text),
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(resumes).toEqual([['run-1', 2]])
    expect(tokens.join('')).toBe('Eins Zwei')
  })

  it('keeps trying while the network is down and carries on when it is back', async () => {
    let attempts = 0
    const reconnecting: number[] = []
    const result = await followRun({
      open: async () => brokenSse(START),
      resume: async () => {
        attempts += 1
        if (attempts < 3) throw new TypeError('Failed to fetch')
        return sse(frame(2, 'done', {}))
      },
      onFrame: () => {},
      onReconnecting: (attempt) => reconnecting.push(attempt),
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(reconnecting).toEqual([1, 2, 3])
  })

  it('gives up after the allowed number of attempts and says which run was lost', async () => {
    const result = await followRun({
      open: async () => brokenSse(START),
      resume: async () => {
        throw new TypeError('Failed to fetch')
      },
      onFrame: () => {},
      signal: new AbortController().signal,
      sleep: noSleep,
      maxReconnects: 3,
    })
    expect(result).toEqual({ kind: 'lost', runId: 'run-1' })
  })

  it('treats a run the server no longer knows as lost instead of retrying forever', async () => {
    let resumes = 0
    const result = await followRun({
      open: async () => brokenSse(START),
      resume: async () => {
        resumes += 1
        return new Response('{}', { status: 404 })
      },
      onFrame: () => {},
      signal: new AbortController().signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'lost', runId: 'run-1' })
    expect(resumes).toBe(1)
  })

  it('reports a refused first request with its status and body', async () => {
    const result = await followRun({
      open: async () => new Response(JSON.stringify({ code: 'ADVISOR_DAILY_LIMIT_EXCEEDED' }), { status: 429 }),
      resume: async () => sse(''),
      onFrame: () => {},
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'http-error', status: 429, body: { code: 'ADVISOR_DAILY_LIMIT_EXCEEDED' } })
  })

  it('ends as aborted when the caller leaves, without another request', async () => {
    const leave = new AbortController()
    let resumes = 0
    const result = await followRun({
      open: async () => brokenSse(START),
      resume: async () => {
        resumes += 1
        return sse('')
      },
      onFrame: () => leave.abort(),
      signal: leave.signal,
      sleep: noSleep,
    })
    expect(result).toEqual({ kind: 'aborted' })
    expect(resumes).toBe(0)
  })

  it('re-attaches to a run that was found running, starting from its first event', async () => {
    const result = await followRun({
      runId: 'run-9',
      open: async () => sse(frame(1, 'start', { runId: 'run-9' }) + frame(2, 'done', {})),
      resume: async () => sse(''),
      onFrame: () => {},
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'finished' })
  })

  it('accepts a plain JSON answer as a finished turn', async () => {
    const seen: RunFrame[] = []
    const result = await followRun({
      open: async () => new Response(JSON.stringify({ mode: 'langgraph' }), { status: 200, headers: { 'content-type': 'application/json' } }),
      resume: async () => sse(''),
      onFrame: (f) => seen.push(f),
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ kind: 'finished' })
    expect(seen).toEqual([{ id: null, event: 'done', data: { mode: 'langgraph' } }])
  })
})
