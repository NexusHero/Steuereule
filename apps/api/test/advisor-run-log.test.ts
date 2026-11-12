import type { AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { InMemoryAdvisorRunLog, type AdvisorRunEntry, type AdvisorRunLog } from '../src/advisor/run/advisor-run-log.js'

const INFO = { runId: 'run-1', userId: 'u1', taxYear: 2025, assistantMessageId: 'm2' }
const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })

async function drain(log: AdvisorRunLog, afterSeq: number, signal?: AbortSignal): Promise<AdvisorRunEntry[]> {
  const out: AdvisorRunEntry[] = []
  for await (const entry of log.read(INFO.runId, afterSeq, signal)) out.push(entry)
  return out
}

/** The contract every run log has to keep; the Redis log runs the same suite in the integration tests. */
export function describeRunLogContract(name: string, create: () => AdvisorRunLog): void {
  describe(`${name}: run log contract (#476)`, () => {
    it('numbers events gaplessly from 1', async () => {
      const log = create()
      await log.open(INFO)
      expect(await log.append(INFO.runId, token('a'))).toBe(1)
      expect(await log.append(INFO.runId, token('b'))).toBe(2)
      await log.close(INFO.runId)
      expect((await drain(log, 0)).map((e) => e.seq)).toEqual([1, 2])
    })

    it('resumes after a sequence number without repeating or skipping', async () => {
      const log = create()
      await log.open(INFO)
      for (const text of ['a', 'b', 'c', 'd']) await log.append(INFO.runId, token(text))
      await log.close(INFO.runId)
      const rest = await drain(log, 2)
      expect(rest.map((e) => e.seq)).toEqual([3, 4])
      expect(rest.map((e) => (e.event.event === 'token' ? e.event.data.text : ''))).toEqual(['c', 'd'])
    })

    it('delivers live: a reader that is already waiting sees later events and ends on close', async () => {
      const log = create()
      await log.open(INFO)
      await log.append(INFO.runId, token('a'))
      const reading = drain(log, 0)
      await new Promise((resolve) => setTimeout(resolve, 20))
      await log.append(INFO.runId, token('b'))
      await log.close(INFO.runId)
      expect((await reading).map((e) => e.seq)).toEqual([1, 2])
    })

    it('serves two readers the same events independently', async () => {
      const log = create()
      await log.open(INFO)
      const first = drain(log, 0)
      const second = drain(log, 0)
      await log.append(INFO.runId, token('a'))
      await log.close(INFO.runId)
      expect(await first).toEqual(await second)
    })

    it('lets a reader leave without ending the run', async () => {
      const log = create()
      await log.open(INFO)
      await log.append(INFO.runId, token('a'))
      const leave = new AbortController()
      const reading = drain(log, 0, leave.signal)
      await new Promise((resolve) => setTimeout(resolve, 20))
      leave.abort()
      expect((await reading).map((e) => e.seq)).toEqual([1])
      expect(await log.append(INFO.runId, token('b'))).toBe(2)
      await log.close(INFO.runId)
    })

    it('knows who owns a run, and nothing about a run that never existed', async () => {
      const log = create()
      await log.open(INFO)
      expect(await log.info(INFO.runId)).toEqual(INFO)
      expect(await log.info('nope')).toBeNull()
      await log.close(INFO.runId)
      // Reading a run nobody opened ends at once instead of waiting forever.
      const unknown: AdvisorRunEntry[] = []
      for await (const entry of log.read('nope', 0)) unknown.push(entry)
      expect(unknown).toEqual([])
    })

    it('passes a stop request to the listener of that run only', async () => {
      const log = create()
      await log.open(INFO)
      const stopped: string[] = []
      log.onStop(INFO.runId, () => stopped.push('run-1'))
      log.onStop('run-2', () => stopped.push('run-2'))
      await new Promise((resolve) => setTimeout(resolve, 50))
      await log.requestStop(INFO.runId)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(stopped).toEqual(['run-1'])
      await log.close(INFO.runId)
    })
  })
}

describeRunLogContract('InMemoryAdvisorRunLog', () => new InMemoryAdvisorRunLog())
