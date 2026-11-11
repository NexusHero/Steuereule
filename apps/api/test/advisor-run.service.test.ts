import type { AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { InMemoryAdvisorRunLog, type AdvisorRunEntry } from '../src/advisor/run/advisor-run-log.js'
import { AdvisorRunService } from '../src/advisor/run/advisor-run.service.js'
import { buildAdvisorTestKit, doneEvent, ScriptedAdvisorEngine, type ScriptStep } from './fakes/advisor-test-kit.js'

const USER = 'user-run-1'
const YEAR = 2025
const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })

function gate(): { readonly open: () => void; readonly opened: Promise<void> } {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { open, opened }
}

function build(script: readonly ScriptStep[]) {
  const kit = buildAdvisorTestKit(new ScriptedAdvisorEngine(script))
  const log = new InMemoryAdvisorRunLog()
  const runs = new AdvisorRunService(kit.service, log, kit.advisorRepo)
  return { ...kit, log, runs }
}

async function drain(stream: AsyncIterable<AdvisorRunEntry>): Promise<AdvisorRunEntry[]> {
  const out: AdvisorRunEntry[] = []
  for await (const entry of stream) out.push(entry)
  return out
}

const texts = (entries: readonly AdvisorRunEntry[]): string =>
  entries.map((e) => (e.event.event === 'token' ? e.event.data.text : '')).join('')

describe('AdvisorRunService: answers detached from the connection (#476)', () => {
  it('numbers the events of a run from start to done', async () => {
    const { runs } = build([token('Hal'), token('lo'), doneEvent({ replyText: 'Hallo' })])
    const { runId } = await runs.start(USER, YEAR, { message: 'Hi' })
    const entries = await drain(await runs.events(USER, runId, 0))

    expect(entries.map((e) => e.seq)).toEqual(entries.map((_, i) => i + 1))
    expect(entries[0]!.event.event).toBe('start')
    expect(entries.at(-1)!.event.event).toBe('done')
    expect(texts(entries)).toBe('Hallo')
  })

  it('finishes the answer although the reader went away, and a new reader catches up without gaps or repeats', async () => {
    const hold = gate()
    const { runs, advisorRepo } = build([token('Eins '), { waitFor: hold.opened }, token('Zwei '), token('Drei'), doneEvent({ replyText: 'Eins Zwei Drei' })])
    const { runId } = await runs.start(USER, YEAR, { message: 'Zähl' })

    // First connection: reads up to the first token, then the network drops.
    const connection = new AbortController()
    const seen: AdvisorRunEntry[] = []
    for await (const entry of await runs.events(USER, runId, 0, connection.signal)) {
      seen.push(entry)
      if (entry.event.event === 'token') connection.abort()
    }
    expect(texts(seen)).toBe('Eins ')

    // Nobody is listening; the run goes on regardless.
    hold.open()
    const rest = await drain(await runs.events(USER, runId, seen.at(-1)!.seq))
    expect(texts(rest)).toBe('Zwei Drei')
    expect(rest[0]!.seq).toBe(seen.at(-1)!.seq + 1)
    expect(rest.at(-1)!.event.event).toBe('done')

    const answer = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(answer.status).toBe('complete')
    expect(answer.content).toBe('Eins Zwei Drei')
  })

  it('stops only on an explicit stop, and stores the partial answer as aborted', async () => {
    const { runs, advisorRepo } = build([token('Teil'), { waitForAbort: true }])
    const { runId } = await runs.start(USER, YEAR, { message: 'Hi' })

    const reader = (async () => drain(await runs.events(USER, runId, 0)))()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(await runs.stop(USER, runId)).toEqual({ stopped: true })

    const answer = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(answer.status).toBe('aborted')
    expect(answer.content).toBe('Teil')
    expect((await reader).at(-1)!.event.event).toBe('done')
    // Stopping an answer that has ended is not an error.
    expect(await runs.stop(USER, runId)).toEqual({ stopped: false })
  })

  it('hides a run from everyone but its owner', async () => {
    const { runs } = build([token('x'), doneEvent({ replyText: 'x' })])
    const { runId } = await runs.start(USER, YEAR, { message: 'Hi' })
    await expect(runs.events('someone-else', runId, 0)).rejects.toMatchObject({ kind: 'not-found' })
    await expect(runs.stop('someone-else', runId)).rejects.toMatchObject({ kind: 'not-found' })
    await expect(runs.events(USER, 'no-such-run', 0)).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('reports the quota as an error of the start call, before any run exists', async () => {
    const { runs, advisorRepo } = build([token('x'), doneEvent({ replyText: 'x' })])
    for (let i = 0; i < 50; i += 1) {
      await advisorRepo.createMessage({ userId: USER, taxYear: YEAR, role: 'user', content: 'q', meta: null })
    }
    await expect(runs.start(USER, YEAR, { message: 'Hi' })).rejects.toMatchObject({ kind: 'rate-limited' })
  })

  it('marks an answer failed whose run no instance knows any more', async () => {
    const { runs, advisorRepo } = build([])
    await advisorRepo.createMessage({ userId: USER, taxYear: YEAR, role: 'user', content: 'q', meta: null })
    const orphan = await advisorRepo.createMessage({
      userId: USER, taxYear: YEAR, role: 'assistant', content: 'halb', meta: null, status: 'streaming', runId: 'lost-run',
    })

    const session = await runs.getSession(USER, YEAR)
    expect(session.messages[1]).toMatchObject({ id: orphan.id, status: 'failed', content: 'halb' })
    expect(session.messages[1]!.runId).toBeUndefined()
  })

  it('offers a running answer for re-attachment in the session', async () => {
    const hold = gate()
    const { runs } = build([token('x'), { waitFor: hold.opened }, doneEvent({ replyText: 'x' })])
    const { runId } = await runs.start(USER, YEAR, { message: 'Hi' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    const session = await runs.getSession(USER, YEAR)
    expect(session.messages[1]).toMatchObject({ status: 'streaming', runId })
    hold.open()
    await drain(await runs.events(USER, runId, 0))
  })

  it('refuses to clear the conversation while an answer is still running', async () => {
    const hold = gate()
    const { runs, advisorRepo } = build([token('x'), { waitFor: hold.opened }, doneEvent({ replyText: 'x' })])
    const { runId } = await runs.start(USER, YEAR, { message: 'Hi' })
    await expect(runs.clearConversation(USER, YEAR)).rejects.toMatchObject({ kind: 'conflict' })

    hold.open()
    await drain(await runs.events(USER, runId, 0))
    expect(await runs.clearConversation(USER, YEAR)).toEqual({ deletedMessages: 2 })
    expect(await advisorRepo.listForUserAndYear(USER, YEAR)).toHaveLength(0)
  })

  it('ends every running answer as aborted when the instance shuts down', async () => {
    const { runs, advisorRepo } = build([token('Teil'), { waitForAbort: true }])
    await runs.start(USER, YEAR, { message: 'Hi' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await runs.onApplicationShutdown()
    expect((await advisorRepo.listForUserAndYear(USER, YEAR))[1]!.status).toBe('aborted')
  })
})
