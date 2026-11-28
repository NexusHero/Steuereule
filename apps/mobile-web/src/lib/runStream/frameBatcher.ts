// Tokens arrive far more often than the screen repaints. Collecting them and handing them on once
// per frame keeps a long answer from re-rendering the chat hundreds of times a second (#476).

type Schedule = (run: () => void) => () => void

const scheduleFrame: Schedule = (run) => {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(run)
    return () => cancelAnimationFrame(handle)
  }
  const handle = setTimeout(run, 16)
  return () => clearTimeout(handle)
}

export interface FrameBatcher {
  push(text: string): void
  /** Delivers what is waiting right now, e.g. before the final message replaces the stream. */
  flush(): void
  /** Drops what is waiting. */
  cancel(): void
}

export function createFrameBatcher(deliver: (text: string) => void, schedule: Schedule = scheduleFrame): FrameBatcher {
  let pending = ''
  let cancelScheduled: (() => void) | null = null

  const flush = (): void => {
    cancelScheduled?.()
    cancelScheduled = null
    if (pending.length === 0) return
    const text = pending
    pending = ''
    deliver(text)
  }

  return {
    push(text) {
      if (text.length === 0) return
      pending += text
      cancelScheduled ??= schedule(() => {
        cancelScheduled = null
        flush()
      })
    },
    flush,
    cancel() {
      cancelScheduled?.()
      cancelScheduled = null
      pending = ''
    },
  }
}
