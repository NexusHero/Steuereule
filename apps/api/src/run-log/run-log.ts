/** How long a finished run stays readable, so a client that was offline can still catch up. */
export const RUN_RETENTION_MS = 5 * 60_000

/** Whose run it is. A feature extends this with what it needs to find its way back to its own records. */
export interface RunInfo {
  readonly runId: string
  readonly userId: string
}

export interface RunEntry<Event> {
  /** 1-based and gapless within a run; a client resumes with the last one it saw. */
  readonly seq: number
  readonly event: Event
}

/**
 * The event log of work that outlives its HTTP connection (#476): a run writes here, readers follow from
 * any sequence number, on any API instance when the log lives in Redis. The log knows neither what an
 * event means nor what the run is for; the feature that runs something names both types.
 */
export interface RunLog<Event, Info extends RunInfo = RunInfo> {
  /** True when every instance sees the same runs. A local log cannot tell a lost run from one on another instance. */
  readonly shared: boolean
  open(info: Info): Promise<void>
  info(runId: string): Promise<Info | null>
  append(runId: string, event: Event): Promise<number>
  /** No further events follow; readers drain what is there and end. */
  close(runId: string): Promise<void>
  /** Entries after `afterSeq`, live until the run is closed. Ends early when `signal` aborts. */
  read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<RunEntry<Event>>
  /** Asks whichever instance executes the run to stop it. */
  requestStop(runId: string): Promise<void>
  /** Called once when a stop is requested for the run; returns the unsubscribe function. */
  onStop(runId: string, listener: () => void): () => void
}

interface MemoryRun<Event, Info> {
  readonly info: Info
  readonly entries: RunEntry<Event>[]
  closed: boolean
  readonly wakeups: Set<() => void>
}

/** Single-instance log: correct for one API process, and the stand-in wherever Redis is absent. */
export class InMemoryRunLog<Event, Info extends RunInfo = RunInfo> implements RunLog<Event, Info> {
  readonly shared = false
  private readonly runs = new Map<string, MemoryRun<Event, Info>>()
  private readonly stopListeners = new Map<string, Set<() => void>>()

  constructor(private readonly retentionMs: number = RUN_RETENTION_MS) {}

  async open(info: Info): Promise<void> {
    this.runs.set(info.runId, { info, entries: [], closed: false, wakeups: new Set() })
  }

  async info(runId: string): Promise<Info | null> {
    return this.runs.get(runId)?.info ?? null
  }

  async append(runId: string, event: Event): Promise<number> {
    const run = this.runs.get(runId)
    if (!run || run.closed) throw new Error(`Run ${runId} is not open`)
    const seq = run.entries.length + 1
    run.entries.push({ seq, event })
    this.wake(run)
    return seq
  }

  async close(runId: string): Promise<void> {
    const run = this.runs.get(runId)
    if (!run || run.closed) return
    run.closed = true
    this.wake(run)
    this.stopListeners.delete(runId)
    const timer = setTimeout(() => this.runs.delete(runId), this.retentionMs)
    timer.unref?.()
  }

  async *read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<RunEntry<Event>> {
    const run = this.runs.get(runId)
    if (!run) return
    let next = afterSeq
    for (;;) {
      if (signal?.aborted) return
      while (next < run.entries.length) {
        yield run.entries[next]!
        next += 1
        if (signal?.aborted) return
      }
      if (run.closed) return
      await new Promise<void>((resolve) => {
        const done = (): void => {
          run.wakeups.delete(done)
          signal?.removeEventListener('abort', done)
          resolve()
        }
        run.wakeups.add(done)
        signal?.addEventListener('abort', done, { once: true })
      })
    }
  }

  async requestStop(runId: string): Promise<void> {
    for (const listener of this.stopListeners.get(runId) ?? []) listener()
  }

  onStop(runId: string, listener: () => void): () => void {
    const listeners = this.stopListeners.get(runId) ?? new Set()
    listeners.add(listener)
    this.stopListeners.set(runId, listeners)
    return () => listeners.delete(listener)
  }

  private wake(run: MemoryRun<Event, Info>): void {
    // Deleting from a Set while iterating it is well defined: each waiter removes only itself.
    for (const wakeup of run.wakeups) wakeup()
  }
}
