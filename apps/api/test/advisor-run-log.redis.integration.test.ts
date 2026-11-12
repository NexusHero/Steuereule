// The Redis Streams run log against a real Redis (#476). Skipped without REDIS_URL, so the DB-gated
// tier stays green on machines that only have Postgres.
import { Redis } from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { RedisAdvisorRunLog } from '../src/advisor/run/advisor-run-log.redis.js'
import type { AdvisorRunEntry } from '../src/advisor/run/advisor-run-log.js'

const url = process.env.REDIS_URL?.trim()
const suite = url ? describe : describe.skip

suite('RedisAdvisorRunLog (#476)', () => {
  const connections: Redis[] = []
  const logs: RedisAdvisorRunLog[] = []
  const create = (): RedisAdvisorRunLog => {
    const redis = new Redis(url!, { maxRetriesPerRequest: 2 })
    connections.push(redis)
    const log = new RedisAdvisorRunLog(redis, 2_000)
    logs.push(log)
    return log
  }
  const info = () => ({ runId: `run-${Math.random().toString(36).slice(2)}`, userId: 'u1', taxYear: 2025, assistantMessageId: 'm2' })
  const drain = async (log: RedisAdvisorRunLog, runId: string, afterSeq: number, signal?: AbortSignal): Promise<AdvisorRunEntry[]> => {
    const out: AdvisorRunEntry[] = []
    for await (const entry of log.read(runId, afterSeq, signal)) out.push(entry)
    return out
  }

  afterAll(async () => {
    await Promise.all(logs.map((log) => log.quit()))
    for (const redis of connections) redis.disconnect()
  })

  it('numbers events from 1 and replays them after a sequence number', async () => {
    const log = create()
    const run = info()
    await log.open(run)
    for (const text of ['a', 'b', 'c']) await log.append(run.runId, { event: 'token', data: { text } })
    await log.close(run.runId)

    expect((await drain(log, run.runId, 0)).map((e) => e.seq)).toEqual([1, 2, 3])
    const rest = await drain(log, run.runId, 1)
    expect(rest.map((e) => (e.event.event === 'token' ? e.event.data.text : ''))).toEqual(['b', 'c'])
  })

  it('lets a second instance follow a run live and see it end', async () => {
    const writer = create()
    const otherInstance = create()
    const run = info()
    await writer.open(run)
    await writer.append(run.runId, { event: 'token', data: { text: 'a' } })

    const reading = drain(otherInstance, run.runId, 0)
    await new Promise((resolve) => setTimeout(resolve, 100))
    await writer.append(run.runId, { event: 'token', data: { text: 'b' } })
    await writer.close(run.runId)

    expect((await reading).map((e) => e.seq)).toEqual([1, 2])
    expect(await otherInstance.info(run.runId)).toEqual(run)
  })

  it('carries a stop request from one instance to the one that runs the answer', async () => {
    const executing = create()
    const receiving = create()
    const run = info()
    await executing.open(run)
    let stopped = 0
    executing.onStop(run.runId, () => {
      stopped += 1
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    await receiving.requestStop(run.runId)
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(stopped).toBe(1)
    await executing.close(run.runId)
  })

  it('releases a reader that leaves, and ends at once for a run nobody opened', async () => {
    const log = create()
    const run = info()
    await log.open(run)
    await log.append(run.runId, { event: 'token', data: { text: 'a' } })
    const leave = new AbortController()
    const reading = drain(log, run.runId, 0, leave.signal)
    await new Promise((resolve) => setTimeout(resolve, 100))
    leave.abort()
    expect((await reading).map((e) => e.seq)).toEqual([1])
    await log.close(run.runId)

    expect(await drain(log, 'never-opened', 0)).toEqual([])
    expect(await log.info('never-opened')).toBeNull()
  })

  it('expires a finished run after its retention time', async () => {
    const log = create()
    const run = info()
    await log.open(run)
    await log.append(run.runId, { event: 'token', data: { text: 'a' } })
    await log.close(run.runId)
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    expect(await log.info(run.runId)).toBeNull()
    expect(await drain(log, run.runId, 0)).toEqual([])
  })
})
