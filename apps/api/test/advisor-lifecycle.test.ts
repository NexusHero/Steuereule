import type { AdvisorStreamEvent } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import type { SendAdvisorMessageResponseDto } from '../src/advisor/dto/advisor.dto.js'
import { buildAdvisorTestKit, collect, doneEvent, ScriptedAdvisorEngine } from './fakes/advisor-test-kit.js'

const USER = 'user-lifecycle-1'
const YEAR = 2025

const token = (text: string): AdvisorStreamEvent => ({ event: 'token', data: { text } })

function doneData(events: readonly AdvisorStreamEvent[]): SendAdvisorMessageResponseDto {
  const done = events.find((e) => e.event === 'done')
  if (!done) throw new Error('no done event')
  return done.data as SendAdvisorMessageResponseDto
}

describe('AdvisorService message lifecycle (#476)', () => {
  it('opens every turn with a start event naming the run and both messages', async () => {
    const { service, advisorRepo } = buildAdvisorTestKit(new ScriptedAdvisorEngine([token('Hallo'), doneEvent({ replyText: 'Hallo' })]))
    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Hi' }))

    const first = events[0]!
    expect(first.event).toBe('start')
    if (first.event !== 'start') return
    expect(first.data.runId).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.data.userMessage.content).toBe('Hi')

    const rows = await advisorRepo.listForUserAndYear(USER, YEAR)
    expect(rows.map((r) => r.id)).toEqual([first.data.userMessage.id, first.data.assistantMessageId])
  })

  it('stores the answer as streaming first and as complete at the end', async () => {
    const engine = new ScriptedAdvisorEngine([token('Hal'), token('lo'), doneEvent({ replyText: 'Hallo' })])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)

    const seenWhileStreaming: string[] = []
    for await (const event of service.streamMessage(USER, YEAR, { message: 'Hi' })) {
      if (event.event === 'token') {
        const rows = await advisorRepo.listForUserAndYear(USER, YEAR)
        seenWhileStreaming.push(`${rows[1]!.status}:${rows[1]!.runId !== null}`)
      }
    }
    expect(seenWhileStreaming).toEqual(['streaming:true', 'streaming:true'])

    const answer = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(answer.status).toBe('complete')
    expect(answer.content).toBe('Hallo')
    expect(answer.runId).toBeNull()
  })

  it('keeps the partial text of a stopped answer as aborted, without any proposal', async () => {
    const stop = new AbortController()
    const engine = new ScriptedAdvisorEngine([
      { event: 'tool', data: { name: 'simulate_tax_delta', label: 'Simuliere …' } },
      token('Die Entfernungspau'),
      { waitForAbort: true },
    ])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)

    const events: AdvisorStreamEvent[] = []
    for await (const event of service.streamMessage(USER, YEAR, { message: 'Arbeitsweg?' }, stop.signal)) {
      events.push(event)
      if (event.event === 'token') stop.abort()
    }

    const response = doneData(events)
    expect(response.assistantMessage.status).toBe('aborted')
    expect(response.assistantMessage.content).toBe('Die Entfernungspau')
    expect(response.assistantMessage.meta?.action).toBeUndefined()

    const stored = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(stored.status).toBe('aborted')
    expect(stored.content).toBe('Die Entfernungspau')
    expect(stored.meta?.steps).toEqual(['Simuliere …'])
  })

  it('marks the answer failed when the engine reports an error mid-way', async () => {
    const engine = new ScriptedAdvisorEngine([
      token('halb'),
      { event: 'error', data: { code: 'ADVISOR_TURN_TIMEOUT', message: 'zu lange' } },
    ])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Hi' }))

    expect(events.at(-1)).toEqual({ event: 'error', data: { code: 'ADVISOR_TURN_TIMEOUT', message: 'zu lange' } })
    const stored = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(stored.status).toBe('failed')
    expect(stored.content).toBe('halb')
  })

  it('marks the answer failed when the engine throws, and reports it as a stream error', async () => {
    const { service, advisorRepo } = buildAdvisorTestKit(new ScriptedAdvisorEngine([token('x'), { fail: new Error('boom') }]))
    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Hi' }))

    expect(events.at(-1)?.event).toBe('error')
    expect((await advisorRepo.listForUserAndYear(USER, YEAR))[1]!.status).toBe('failed')
  })

  it('never leaves an answer streaming when the consumer walks away', async () => {
    const { service, advisorRepo } = buildAdvisorTestKit(
      new ScriptedAdvisorEngine([token('a'), token('b'), doneEvent({ replyText: 'ab' })]),
    )
    for await (const event of service.streamMessage(USER, YEAR, { message: 'Hi' })) {
      if (event.event === 'token') break
    }
    const stored = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(stored.status).toBe('aborted')
    expect(stored.content).toBe('a')
  })

  it('stores the reasoning summary, the steps and what the turn cost', async () => {
    const engine = new ScriptedAdvisorEngine([
      { event: 'status', data: { text: 'Eule prüft …' } },
      { event: 'reasoning', data: { text: 'Erst die Pauschale ' } },
      { event: 'reasoning', data: { text: 'prüfen.' } },
      { event: 'tool', data: { name: 'lookup_legal_source', label: 'Prüfe EStG-Paragraph …' } },
      token('Antwort'),
      doneEvent({ replyText: 'Antwort', usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 900 } }),
    ])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Hi' }))

    const response = doneData(events)
    expect(response.assistantMessage.reasoning).toBe('Erst die Pauschale prüfen.')
    expect(response.assistantMessage.meta?.steps).toEqual(['Eule prüft …', 'Prüfe EStG-Paragraph …'])
    // Cost and timing are for operations, not for the client.
    expect(JSON.stringify(response)).not.toContain('inputTokens')

    const stored = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect(stored.reasoning).toBe('Erst die Pauschale prüfen.')
    expect(stored.usage).toMatchObject({ inputTokens: 1200, outputTokens: 80, cachedInputTokens: 900 })
    expect(stored.usage?.traceId).toBeTruthy()
    expect(stored.usage?.firstTokenMs).toBeGreaterThanOrEqual(0)
    expect(stored.usage?.durationMs).toBeGreaterThanOrEqual(stored.usage!.firstTokenMs!)
  })

  it('completes the deterministic turn through the same lifecycle', async () => {
    const { service, advisorRepo } = buildAdvisorTestKit()
    const events = await collect(service.streamMessage(USER, YEAR, { message: 'Hallo Eule' }))
    expect(events[0]!.event).toBe('start')
    expect(doneData(events).assistantMessage.status).toBe('complete')
    expect((await advisorRepo.listForUserAndYear(USER, YEAR)).map((r) => r.status)).toEqual(['complete', 'complete'])
  })

  it('hands the model its own earlier proposals and their outcome', async () => {
    const engine = new ScriptedAdvisorEngine([token('ok'), doneEvent({ replyText: 'ok' })])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    await advisorRepo.createMessage({ userId: USER, taxYear: YEAR, role: 'user', content: 'Arbeitsweg 38 km', meta: null })
    await advisorRepo.createMessage({
      userId: USER,
      taxYear: YEAR,
      role: 'assistant',
      content: 'Entwurf vorbereitet.',
      meta: {
        action: {
          actionId: 'act-1', status: 'applied', screen: 'commute', field: 'oneWayKm', instance: null,
          label: 'Einfacher Arbeitsweg', previousValue: null, newValue: '38',
          beforeRefundEur: 0, afterRefundEur: 100, deltaEur: 100, reason: 'r', sourceId: 'estg-9-1',
        },
      },
    })

    await collect(service.streamMessage(USER, YEAR, { message: 'Und jetzt?' }))
    const history = engine.requests[0]!.history!
    expect(history).toHaveLength(2)
    expect(history[1]!.content).toContain('Einfacher Arbeitsweg')
    expect(history[1]!.content).toContain('übernommen')
  })
})

describe('AdvisorService feedback and clearing (#476)', () => {
  async function oneTurn() {
    const kit = buildAdvisorTestKit(new ScriptedAdvisorEngine([token('ok'), doneEvent({ replyText: 'ok' })]))
    const response = doneData(await collect(kit.service.streamMessage(USER, YEAR, { message: 'Hi' })))
    return { ...kit, response }
  }

  it('stores a thumbs down with its reason and returns it with the session', async () => {
    const { service, response } = await oneTurn()
    const updated = await service.setFeedback(USER, YEAR, response.assistantMessage.id, { rating: 'down', reason: 'unklar' })
    expect(updated.feedback).toEqual({ rating: 'down', reason: 'unklar' })

    const session = await service.getSession(USER, YEAR)
    expect(session.messages[1]!.feedback).toEqual({ rating: 'down', reason: 'unklar' })
  })

  it('drops the reason on a thumbs up and clears the rating on null', async () => {
    const { service, response } = await oneTurn()
    const up = await service.setFeedback(USER, YEAR, response.assistantMessage.id, { rating: 'up', reason: 'falsch' })
    expect(up.feedback).toEqual({ rating: 'up' })
    const cleared = await service.setFeedback(USER, YEAR, response.assistantMessage.id, { rating: null })
    expect(cleared.feedback).toBeNull()
  })

  it('rates only the owl’s own answers, and only the caller’s', async () => {
    const { service, response } = await oneTurn()
    await expect(service.setFeedback(USER, YEAR, response.userMessage.id, { rating: 'up' })).rejects.toMatchObject({ kind: 'invalid-input' })
    await expect(service.setFeedback('someone-else', YEAR, response.assistantMessage.id, { rating: 'up' })).rejects.toMatchObject({ kind: 'not-found' })
    await expect(service.setFeedback(USER, YEAR - 1, response.assistantMessage.id, { rating: 'up' })).rejects.toMatchObject({ kind: 'not-found' })
  })

  it('clears the conversation of one year and nothing else', async () => {
    const { service, advisorRepo } = await oneTurn()
    await collect(service.streamMessage(USER, YEAR - 1, { message: 'Vorjahr' }))
    await collect(service.streamMessage('someone-else', YEAR, { message: 'Fremd' }))

    const result = await service.clearConversation(USER, YEAR)
    expect(result.deletedMessages).toBe(2)
    expect(await advisorRepo.listForUserAndYear(USER, YEAR)).toHaveLength(0)
    expect(await advisorRepo.listForUserAndYear(USER, YEAR - 1)).toHaveLength(2)
    expect(await advisorRepo.listForUserAndYear('someone-else', YEAR)).toHaveLength(2)
  })
})
