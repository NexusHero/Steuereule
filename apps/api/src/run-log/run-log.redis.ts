import type { Redis } from 'ioredis'
import type { FieldEncryptionKeySet } from '../common/field-encryption-keys.js'
import { RUN_RETENTION_MS, type RunEntry, type RunInfo, type RunLog } from './run-log.js'
import { RunEventCipher } from './run-event-cipher.js'

/** A run that never closes (process died) must not live forever. */
const OPEN_RUN_TTL_SECONDS = 15 * 60
const BLOCK_MS = 10_000
const END_FIELD = 'end'
const EVENT_FIELD = 'e'

/** What a sealed event is bound to: its run and its place in the run. */
const entryLabel = (runId: string, seq: number): string => `${runId}:${seq}`
/** What the sealed run info is bound to: its run. Its owner decides who may read or stop the run. */
const infoLabel = (runId: string): string => `${runId}:info`

/**
 * Run log on Redis Streams: one stream per run, the entry id `<seq>-0` is the sequence number, a
 * final `end` entry closes it. Stop requests travel over pub/sub, so any instance can stop a run
 * that another one executes. Event payloads are transient and expire with the stream; they may carry what
 * a user wrote, so each is sealed (AES-256-GCM, key derived from the field-encryption key) before it is
 * written and opened on read (H2-9); so is the run info with its owner. An entry that does not open is skipped.
 */
export interface RedisRunLogOptions {
  /** Prefix of every key and of the stop channel, e.g. `steuereule:advisor:run`: one per feature. */
  readonly namespace: string
  /** What the sealing key is derived for (HKDF info); a fixed name per feature. */
  readonly keyPurpose: string
  readonly retentionMs?: number | undefined
}

export class RedisRunLog<Event, Info extends RunInfo = RunInfo> implements RunLog<Event, Info> {
  readonly shared = true

  private readonly seqByRun = new Map<string, number>()
  private readonly stopListeners = new Map<string, Set<() => void>>()
  private subscriber: Redis | null = null
  private readonly cipher: RunEventCipher
  private readonly namespace: string
  private readonly retentionMs: number

  constructor(
    private readonly redis: Redis,
    keys: FieldEncryptionKeySet,
    options: RedisRunLogOptions,
  ) {
    this.cipher = new RunEventCipher(keys, options.keyPurpose)
    this.namespace = options.namespace
    this.retentionMs = options.retentionMs ?? RUN_RETENTION_MS
  }

  private keyOfStream(runId: string): string {
    return `${this.namespace}:${runId}`
  }

  private keyOfInfo(runId: string): string {
    return `${this.namespace}:${runId}:info`
  }

  private get stopChannel(): string {
    return `${this.namespace}:stop`
  }

  async open(info: Info): Promise<void> {
    this.seqByRun.set(info.runId, 0)
    // Sealed like the events: the owner in it decides who may read or stop the run, so it must not be writable
    // by whoever can write to Redis, and it names the user.
    await this.redis.set(this.keyOfInfo(info.runId), this.cipher.seal(JSON.stringify(info), infoLabel(info.runId)), 'EX', OPEN_RUN_TTL_SECONDS)
  }

  async info(runId: string): Promise<Info | null> {
    const raw = await this.redis.get(this.keyOfInfo(runId))
    if (!raw) return null
    // An entry that was not sealed here, was changed, or belongs to another run counts as no run.
    const opened = this.cipher.open(raw, infoLabel(runId))
    return opened === null ? null : (JSON.parse(opened) as Info)
  }

  async append(runId: string, event: Event): Promise<number> {
    const current = this.seqByRun.get(runId)
    if (current === undefined) throw new Error(`Run ${runId} is not open on this instance`)
    const seq = current + 1
    this.seqByRun.set(runId, seq)
    const key = this.keyOfStream(runId)
    const sealed = this.cipher.seal(JSON.stringify(event), entryLabel(runId, seq))
    await this.redis.multi().xadd(key, `${seq}-0`, EVENT_FIELD, sealed).expire(key, OPEN_RUN_TTL_SECONDS).exec()
    return seq
  }

  async close(runId: string): Promise<void> {
    const current = this.seqByRun.get(runId)
    if (current === undefined) return
    this.seqByRun.delete(runId)
    this.stopListeners.delete(runId)
    const key = this.keyOfStream(runId)
    const ttl = Math.ceil(this.retentionMs / 1000)
    await this.redis
      .multi()
      .xadd(key, `${current + 1}-0`, END_FIELD, '1')
      .expire(key, ttl)
      .expire(this.keyOfInfo(runId), ttl)
      .exec()
  }

  async *read(runId: string, afterSeq: number, signal?: AbortSignal): AsyncIterable<RunEntry<Event>> {
    // XREAD BLOCK occupies its connection, so every reader gets its own.
    const reader = this.redis.duplicate()
    const disconnect = (): void => reader.disconnect()
    signal?.addEventListener('abort', disconnect, { once: true })
    let lastId = `${afterSeq}-0`
    let idleRounds = 0
    try {
      // A run nobody opened (or one long expired) ends at once instead of blocking.
      if ((await this.redis.exists(this.keyOfStream(runId), this.keyOfInfo(runId))) === 0) return
      for (;;) {
        if (signal?.aborted) return
        const reply = await reader.xread('BLOCK', BLOCK_MS, 'STREAMS', this.keyOfStream(runId), lastId).catch((error: unknown) => {
          if (signal?.aborted) return null
          throw error
        })
        if (!reply) {
          // Nothing for a whole block: if the run is unknown by now, it is gone and never comes back.
          idleRounds += 1
          if (idleRounds >= 2 && (await this.redis.exists(this.keyOfInfo(runId))) === 0) return
          continue
        }
        idleRounds = 0
        for (const [, entries] of reply) {
          for (const [id, fields] of entries) {
            lastId = id
            if (fields[0] === END_FIELD) return
            const payload = fields[fields.indexOf(EVENT_FIELD) + 1]
            if (payload === undefined) continue
            const seq = Number(id.split('-')[0])
            const opened = this.cipher.open(payload, entryLabel(runId, seq))
            if (opened === null) continue
            yield { seq, event: JSON.parse(opened) as Event }
          }
        }
      }
    } finally {
      signal?.removeEventListener('abort', disconnect)
      reader.disconnect()
    }
  }

  async requestStop(runId: string): Promise<void> {
    await this.redis.publish(this.stopChannel, runId)
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
      if (channel !== this.stopChannel) return
      for (const listener of this.stopListeners.get(runId) ?? []) listener()
    })
    void subscriber.subscribe(this.stopChannel).catch(() => {
      this.subscriber = null
    })
  }

  async quit(): Promise<void> {
    this.subscriber?.disconnect()
    this.subscriber = null
  }
}
