// Following an answer of the owl over server-sent events (#476). The answer runs on the server,
// detached from this connection: when the connection drops, the client re-attaches with the last
// sequence number it saw and gets exactly the events it missed.

export interface RunFrame {
  /** Sequence number of the event within its run; null for frames without an `id:` line. */
  readonly id: number | null
  readonly event: string
  readonly data: unknown
}

/** Turns SSE text, in whatever pieces it arrives, into frames. Comment lines (heartbeats) are skipped. */
export function createSseDecoder(onFrame: (frame: RunFrame) => void): { push(text: string): void; end(): void } {
  let buffer = ''

  const emit = (block: string): void => {
    let event = 'message'
    let id: number | null = null
    const dataLines: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      else if (line.startsWith('id:')) {
        const parsed = Number.parseInt(line.slice(3).trim(), 10)
        id = Number.isSafeInteger(parsed) ? parsed : null
      }
    }
    if (dataLines.length === 0) return
    try {
      onFrame({ id, event, data: JSON.parse(dataLines.join('\n')) as unknown })
    } catch {
      // A frame that is not JSON is not ours; ignoring it keeps the rest of the answer readable.
    }
  }

  return {
    push(text) {
      buffer += text
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) emit(block)
    },
    end() {
      if (buffer.trim().length > 0) emit(buffer)
      buffer = ''
    },
  }
}

async function readFrames(response: Response, onFrame: (frame: RunFrame) => void, signal: AbortSignal): Promise<void> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    // A plain JSON answer is a finished turn.
    onFrame({ id: null, event: 'done', data: (await response.json()) as unknown })
    return
  }
  const decoder = createSseDecoder(onFrame)
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader()
    // Cancelling the reader closes the stream even where fetch does not tie the body to the signal.
    const cancel = (): void => void reader.cancel().catch(() => {})
    signal.addEventListener('abort', cancel, { once: true })
    const text = new TextDecoder()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        decoder.push(text.decode(value, { stream: true }))
      }
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  } else {
    decoder.push(await response.text())
  }
  decoder.end()
}

export type FollowRunResult =
  /** The run reported its end (`done` or `error`). */
  | { readonly kind: 'finished' }
  /** The first request was refused, e.g. quota or validation. */
  | { readonly kind: 'http-error'; readonly status: number; readonly body: unknown }
  /** The caller's signal ended the following; the run itself is untouched. */
  | { readonly kind: 'aborted' }
  /** The connection could not be restored, or the run is gone. Its outcome is in the session. */
  | { readonly kind: 'lost'; readonly runId: string | null }

export interface FollowRunOptions {
  /** Opens the first connection: the POST that starts a run, or a GET that re-attaches to one. */
  readonly open: () => Promise<Response>
  /** Re-attaches to the run after the given sequence number. */
  readonly resume: (runId: string, afterSeq: number) => Promise<Response>
  readonly onFrame: (frame: RunFrame) => void
  readonly signal: AbortSignal
  /** Known when re-attaching to a run that was found still running. */
  readonly runId?: string | undefined
  readonly onReconnecting?: ((attempt: number) => void) | undefined
  readonly maxReconnects?: number | undefined
  readonly delayMs?: ((attempt: number) => number) | undefined
  readonly sleep?: ((ms: number) => Promise<void>) | undefined
}

const DEFAULT_MAX_RECONNECTS = 6
const defaultDelay = (attempt: number): number => Math.min(8000, 400 * 2 ** (attempt - 1))
const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function runIdOf(frame: RunFrame): string | null {
  if (frame.event !== 'start' || typeof frame.data !== 'object' || frame.data === null) return null
  const runId = (frame.data as { runId?: unknown }).runId
  return typeof runId === 'string' ? runId : null
}

/**
 * Reads a run to its end, re-attaching as often as needed. Every event reaches `onFrame` exactly
 * once and in order, however often the connection breaks in between.
 */
export async function followRun(options: FollowRunOptions): Promise<FollowRunResult> {
  const { signal, onFrame } = options
  const maxReconnects = options.maxReconnects ?? DEFAULT_MAX_RECONNECTS
  const delayMs = options.delayMs ?? defaultDelay
  const sleep = options.sleep ?? defaultSleep
  let runId = options.runId ?? null
  let lastSeq = 0
  let finished = false
  let failures = 0

  const accept = (frame: RunFrame): void => {
    if (frame.id !== null) {
      // An event replayed after a reconnect was already delivered.
      if (frame.id <= lastSeq) return
      lastSeq = frame.id
      failures = 0
    }
    runId = runIdOf(frame) ?? runId
    if (frame.event === 'done' || frame.event === 'error') finished = true
    onFrame(frame)
  }

  let response: Response | null = null
  try {
    response = await options.open()
  } catch (error) {
    if (signal.aborted) return { kind: 'aborted' }
    // Without a run to return to, a failed first request is simply a failed request.
    if (runId === null) throw error
  }
  if (response && !response.ok) {
    const text = await response.text().catch(() => '')
    let body: unknown = null
    try {
      body = text ? (JSON.parse(text) as unknown) : null
    } catch {
      body = null
    }
    return { kind: 'http-error', status: response.status, body }
  }

  for (;;) {
    if (response) {
      try {
        await readFrames(response, accept, signal)
      } catch {
        // The connection broke mid-stream; whether to re-attach is decided below.
      }
    }
    if (finished) return { kind: 'finished' }
    if (signal.aborted) return { kind: 'aborted' }
    if (runId === null) return { kind: 'lost', runId: null }

    response = null
    while (response === null) {
      failures += 1
      if (failures > maxReconnects) return { kind: 'lost', runId }
      options.onReconnecting?.(failures)
      await sleep(delayMs(failures))
      if (signal.aborted) return { kind: 'aborted' }
      try {
        const next = await options.resume(runId, lastSeq)
        // 404: the run has expired or never was ours. Its final state is in the stored conversation.
        if (next.status === 404) return { kind: 'lost', runId }
        if (next.ok) response = next
      } catch {
        if (signal.aborted) return { kind: 'aborted' }
      }
    }
  }
}
