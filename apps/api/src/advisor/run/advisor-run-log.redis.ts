import type { AdvisorStreamEvent } from '@steuereule/core'
import type { Redis } from 'ioredis'
import { RUN_RETENTION_MS, type AdvisorRunEntry, type AdvisorRunInfo, type AdvisorRunLog } from './advisor-run-log.js'

const STOP_CHANNEL = 'steuereule:advisor:run:stop'
/** A run that never closes (process died) must not live forever. */
const OPEN_RUN_TTL_SECONDS = 15 * 60
const BLOCK_MS = 10_000
const END_FIELD = 'end'
const EVENT_FIELD = 'e'

const streamKey = (runId: string): string => `steuereule:advisor:run:${runId}`
const infoKey = (runId: string): string => `steuereule:advisor:run:${runId}:info`

/**
 * Run log on Redis Streams: one stream per run, the entry id `<seq>-0` is the sequence number, a
 * final `end` entry closes it. Stop requests travel over pub/sub, so any instance can stop a run
 * that another one executes. Event payloads are transient and expire with the stream.
 */
export class RedisAdvisorRunLog implements AdvisorRunLog {
  readonly shared = true

  private readonly seqByRun = new Map<string, number>()
  private readonly stopListeners = new Map<string, Set<() => void>>()
  private subscriber: Redis | null = null

  constructor(
    private readonly redis: Redis,
    private readonly retentionMs: number = RUN_RETENTION_MS,
  ) {}

  async open(info: AdvisorRunInfo): Promise<void> {
    this.seqByRun.set(info.runId, 0)
    await this.redis.set(infoKey(info.runId), JSON.stringify(info), 'EX', OPEN_RUN_TTL_SECONDS)
  }

  async info(runId: string): Promise<AdvisorRunInfo | null> {
    const raw = await this.redis.get(infoKey(runId))
    return raw ? (JSON.parse(raw) as AdvisorRunInfo) : null
  }

  async append(runId: string, event: AdvisorStreamEvent): Promise<number> {
    const current = this.seqByRun.get(runId)
    if (current === undefined) throw new Error(`Advisor run ${runId} is not open on this instance`)
    const seq = current + 1
    this.seqByRun.set(runId, seq)
    const key = streamKey(runId)
    await this.redis.multi().xadd(key, `${seq}-0`, EVENT_FIELD, JSON.stringify(event)).expire(key, OPEN_RUN_TTL_SECONDS).exec()
    return seq
  }

  async close(runId: string): Promise<void> {
    const current = this.seqByRun.get(runId)
    if (current === undefined) return
    this.seqByRun.delete(runId)
    this.stopListeners.delete(runId)
    const key = streamKey(runId)
    const ttl = Math.ceil(this.retentionMs / 1000)
    await this.redis
      .multi()
      .xadd(key, `${current + 1}-0`, END_FIELD, '1')
      .expire(key, ttl)
      .expire(infoKey(runId), ttl)
      .exec()
  }

  async *read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<AdvisorRunEntry> {
    // XREAD BLOCK occupies its connection, so every reader gets its own.
    const reader = this.redis.duplicate()
    const disconnect = (): void => reader.disconnect()
    signal?.addEventListener('abort', disconnect, { once: true })
    let lastId = `${afterSeq}-0`
    let idleRounds = 0
    try {
      // A run nobody opened (or one long expired) ends at once instead of blocking.
      if ((await this.redis.exists(streamKey(runId), infoKey(runId))) === 0) return
      for (;;) {
        if (signal?.aborted) return
        const reply = await reader.xread('BLOCK', BLOCK_MS, 'STREAMS', streamKey(runId), lastId).catch((error: unknown) => {
          if (signal?.aborted) return null
          throw error
        })
        if (!reply) {
          // Nothing for a whole block: if the run is unknown by now, it is gone and never comes back.
          idleRounds += 1
          if (idleRounds >= 2 && (await this.redis.exists(infoKey(runId))) === 0) return
          continue
        }
        idleRounds = 0
        for (const [, entries] of reply) {
          for (const [id, fields] of entries) {
            lastId = id
            if (fields[0] === END_FIELD) return
            const payload = fields[fields.indexOf(EVENT_FIELD) + 1]
            if (payload === undefined) continue
            yield { seq: Number(id.split('-')[0]), event: JSON.parse(payload) as AdvisorStreamEvent }
          }
        }
      }
    } finally {
      signal?.removeEventListener('abort', disconnect)
      reader.disconnect()
    }
  }

  async requestStop(runId: string): Promise<void> {
    await this.redis.publish(STOP_CHANNEL, runId)
  }

  onStop(runId: string, listener: () => void): () => void {
    this.ensureSubscribed()
    const listeners = this.stopListeners.get(runId) ?? new Set()
    listeners.add(listener)
    this.stopListeners.set(runId, listeners)
    return () => listeners.delete(listener)
  }

  private ensureSubscribed(): void {
    if (this.subscriber) return
    const subscriber = this.redis.duplicate()
    this.subscriber = subscriber
    subscriber.on('message', (channel: string, runId: string) => {
      if (channel !== STOP_CHANNEL) return
      for (const listener of this.stopListeners.get(runId) ?? []) listener()
    })
    void subscriber.subscribe(STOP_CHANNEL).catch(() => {
      this.subscriber = null
    })
  }

  async quit(): Promise<void> {
    this.subscriber?.disconnect()
    this.subscriber = null
  }
}
