import type { AdvisorStreamEvent } from '@steuereule/core'

export const ADVISOR_RUN_LOG = Symbol('ADVISOR_RUN_LOG')

/** How long a finished run stays readable, so a client that was offline can still catch up. */
export const RUN_RETENTION_MS = 5 * 60_000

export interface AdvisorRunInfo {
  readonly runId: string
  readonly userId: string
  readonly taxYear: number
  readonly assistantMessageId: string
}

export interface AdvisorRunEntry {
  /** 1-based and gapless within a run; a client resumes with the last one it saw. */
  readonly seq: number
  readonly event: AdvisorStreamEvent
}

/**
 * The event log of running answers (#476). A run writes here, detached from any HTTP connection;
 * readers follow from any sequence number, on any API instance when the log lives in Redis.
 */
export interface AdvisorRunLog {
  open(info: AdvisorRunInfo): Promise<void>
  info(runId: string): Promise<AdvisorRunInfo | null>
  append(runId: string, event: AdvisorStreamEvent): Promise<number>
  /** No further events follow; readers drain what is there and end. */
  close(runId: string): Promise<void>
  /** Entries after `afterSeq`, live until the run is closed. Ends early when `signal` aborts. */
  read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<AdvisorRunEntry>
  /** Asks whichever instance executes the run to stop it. */
  requestStop(runId: string): Promise<void>
  /** Called once when a stop is requested for the run; returns the unsubscribe function. */
  onStop(runId: string, listener: () => void): () => void
}

interface MemoryRun {
  readonly info: AdvisorRunInfo
  readonly entries: AdvisorRunEntry[]
  closed: boolean
  readonly wakeups: Set<() => void>
}

/** Single-instance log: correct for one API process, and the stand-in wherever Redis is absent. */
export class InMemoryAdvisorRunLog implements AdvisorRunLog {
  private readonly runs = new Map<string, MemoryRun>()
  private readonly stopListeners = new Map<string, Set<() => void>>()

  constructor(private readonly retentionMs: number = RUN_RETENTION_MS) {}

  async open(info: AdvisorRunInfo): Promise<void> {
    this.runs.set(info.runId, { info, entries: [], closed: false, wakeups: new Set() })
  }

  async info(runId: string): Promise<AdvisorRunInfo | null> {
    return this.runs.get(runId)?.info ?? null
  }

  async append(runId: string, event: AdvisorStreamEvent): Promise<number> {
    const run = this.runs.get(runId)
    if (!run || run.closed) throw new Error(`Advisor run ${runId} is not open`)
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

  async *read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<AdvisorRunEntry> {
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

  private wake(run: MemoryRun): void {
    // Deleting from a Set while iterating it is well defined: each waiter removes only itself.
    for (const wakeup of run.wakeups) wakeup()
  }
}
