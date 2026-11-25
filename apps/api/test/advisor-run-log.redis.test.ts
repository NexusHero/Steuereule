// H2-9: the Redis run log kept an owl run's events (the chat text) in clear for up to 15 minutes while the
// database copy is field-encrypted. Each event is now sealed with AES-256-GCM under a key derived from the
// field-encryption key before XADD, and opened on read; an entry that does not open is skipped.
import { describe, expect, it } from 'vitest'
import { RedisAdvisorRunLog } from '../src/advisor/run/advisor-run-log.redis.js'
import type { AdvisorRunEntry } from '../src/advisor/run/advisor-run-log.js'

const KEYS = { encryptionKey: 'k1.aesgcm256.MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=', decryptionKeys: [] }
const ROTATED = { encryptionKey: 'k2.aesgcm256.ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=', decryptionKeys: [KEYS.encryptionKey] }

type Entry = [id: string, fields: string[]]

/** Just enough of ioredis for the run log: strings, streams (XADD/XREAD), MULTI and EXISTS. */
class FakeRedis {
  readonly strings = new Map<string, string>()
  readonly streams = new Map<string, Entry[]>()

  async set(key: string, value: string): Promise<'OK'> {
    this.strings.set(key, value)
    return 'OK'
  }
  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null
  }
  async exists(...keys: string[]): Promise<number> {
    return keys.filter((key) => this.strings.has(key) || this.streams.has(key)).length
  }
  multi() {
    const ops: (() => void)[] = []
    const chain = {
      xadd: (key: string, id: string, ...fields: string[]) => {
        ops.push(() => this.streams.set(key, [...(this.streams.get(key) ?? []), [id, fields]]))
        return chain
      },
      expire: () => chain,
      exec: async () => {
        for (const op of ops) op()
        return []
      },
    }
    return chain
  }
  duplicate(): FakeRedis {
    return this
  }
  async xread(_block: string, _ms: number, _streams: string, key: string, lastId: string) {
    const after = Number(lastId.split('-')[0])
    const entries = (this.streams.get(key) ?? []).filter(([id]) => Number(id.split('-')[0]) > after)
    return entries.length === 0 ? null : [[key, entries]]
  }
  disconnect(): void {}
}

const info = { runId: 'run-1', userId: 'u1', taxYear: 2025, assistantMessageId: 'm2' }
const SECRET = 'Mein Arbeitgeber ist die Cilag AG in Schaffhausen'

async function drain(log: RedisAdvisorRunLog): Promise<AdvisorRunEntry[]> {
  const out: AdvisorRunEntry[] = []
  for await (const entry of log.read(info.runId, 0)) out.push(entry)
  return out
}

async function recordedRun(keys = KEYS) {
  const redis = new FakeRedis()
  const log = new RedisAdvisorRunLog(redis as never, keys, 2_000)
  await log.open(info)
  await log.append(info.runId, { event: 'token', data: { text: SECRET } })
  await log.append(info.runId, { event: 'token', data: { text: 'zweiter Teil' } })
  await log.close(info.runId)
  return { redis, log }
}

describe('RedisAdvisorRunLog encryption (H2-9)', () => {
  it('stores no event in clear', async () => {
    const { redis } = await recordedRun()
    const stored = JSON.stringify([...redis.streams.values()])
    expect(stored).not.toContain('Cilag')
    expect(stored).not.toContain('token')
  })

  it('reads back the original events in order', async () => {
    const { log } = await recordedRun()
    expect(await drain(log)).toEqual([
      { seq: 1, event: { event: 'token', data: { text: SECRET } } },
      { seq: 2, event: { event: 'token', data: { text: 'zweiter Teil' } } },
    ])
  })

  it('skips an entry that was tampered with', async () => {
    const { redis, log } = await recordedRun()
    const entries = [...redis.streams.values()][0]!
    const fields = entries[0]![1]
    const sealed = fields[1]!
    const flipped = sealed.slice(0, -4) + (sealed.slice(-4, -3) === 'A' ? 'B' : 'A') + sealed.slice(-3)
    fields[1] = flipped

    expect((await drain(log)).map((entry) => entry.seq)).toEqual([2])
  })

  it('skips an entry moved to another position of the stream', async () => {
    const { redis, log } = await recordedRun()
    const entries = [...redis.streams.values()][0]!
    const first = entries[0]![1][1]!
    entries[1]![1][1] = first

    expect((await drain(log)).map((entry) => entry.seq)).toEqual([1])
  })

  it('still opens what was sealed before a key rotation', async () => {
    const { redis } = await recordedRun(KEYS)
    const rotated = new RedisAdvisorRunLog(redis as never, ROTATED, 2_000)
    expect((await drain(rotated)).map((entry) => entry.seq)).toEqual([1, 2])
  })
})
