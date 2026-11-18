// A long message with many points must not lose points across answers, whichever model answers:
// the last plan of a turn is kept with the answer, its open steps go to the model next turn, and the
// app names them under an answer that leaves them out.
import type { AdvisorEnginePort, AdvisorPlanStep, AdvisorStreamEvent, AdvisorTurnRequest, AdvisorTurnResult } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import type { SendAdvisorMessageResponseDto } from '../src/advisor/dto/advisor.dto.js'
import { buildAdvisorTestKit, collect, doneEvent } from './fakes/advisor-test-kit.js'

const USER = 'user-open-plan-1'
const YEAR = 2025

/** Plays one script per turn, in order, and records what each turn was asked. */
class TurnByTurnEngine implements AdvisorEnginePort {
  readonly requests: AdvisorTurnRequest[] = []
  constructor(private readonly turns: ReadonlyArray<readonly AdvisorStreamEvent[]>) {}
  async *streamTurn(request: AdvisorTurnRequest): AsyncIterable<AdvisorStreamEvent> {
    const script = this.turns[this.requests.length] ?? [doneEvent({ replyText: 'Ok.' })]
    this.requests.push(request)
    yield* script
  }
  async runTurn(): Promise<AdvisorTurnResult> {
    throw new Error('not used')
  }
}

const plan = (steps: AdvisorPlanStep[]): AdvisorStreamEvent => ({ event: 'plan', data: { steps } })
const answer = (text: string): AdvisorStreamEvent[] => [{ event: 'token', data: { text } }, doneEvent({ replyText: text })]
const reply = (events: readonly AdvisorStreamEvent[]) => (events.find((e) => e.event === 'done')!.data as SendAdvisorMessageResponseDto).assistantMessage

const firstPlan: AdvisorPlanStep[] = [
  { text: 'Arbeitsweg erfassen', status: 'laeuft' },
  { text: 'Krankenversicherung von Person B erfassen', status: 'offen' },
  { text: 'Spenden erfassen', status: 'offen' },
]
const firstPlanUpdated: AdvisorPlanStep[] = [
  { text: 'Arbeitsweg erfassen', status: 'erledigt' },
  { text: 'Krankenversicherung von Person B erfassen', status: 'offen' },
  { text: 'Spenden erfassen', status: 'offen' },
]

describe('the owl’s plan across answers', () => {
  it('keeps the last plan of a turn with the answer, steps with text and status only', async () => {
    const engine = new TurnByTurnEngine([[plan(firstPlan), plan(firstPlanUpdated), ...answer('Den Arbeitsweg habe ich vorbereitet.')]])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    await collect(service.streamMessage(USER, YEAR, { message: '1. Arbeitsweg 2. KV von Person B 3. Spenden' }))

    const stored = (await advisorRepo.listForUserAndYear(USER, YEAR))[1]!
    expect((stored.meta as { plan?: unknown }).plan).toEqual(firstPlanUpdated)
  })

  it('names the open steps under an answer that leaves them out, and stores that line with the answer', async () => {
    const engine = new TurnByTurnEngine([[plan(firstPlanUpdated), ...answer('Den Arbeitsweg habe ich vorbereitet. Sobald du ihn übernommen hast, machen wir weiter.')]])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    const events = await collect(service.streamMessage(USER, YEAR, { message: '1. Arbeitsweg 2. KV von Person B 3. Spenden' }))

    const line = '\n\nNoch offen: Krankenversicherung von Person B erfassen, Spenden erfassen.'
    expect(reply(events).content).toBe(`Den Arbeitsweg habe ich vorbereitet. Sobald du ihn übernommen hast, machen wir weiter.${line}`)
    expect((await advisorRepo.listForUserAndYear(USER, YEAR))[1]!.content.endsWith(line)).toBe(true)
  })

  it('adds nothing when the answer already names what is open', async () => {
    const text = 'Den Arbeitsweg habe ich vorbereitet. Offen sind noch die Krankenversicherung von Person B und die Spenden.'
    const engine = new TurnByTurnEngine([[plan(firstPlanUpdated), ...answer(text)]])
    const { service } = buildAdvisorTestKit(engine)
    expect(reply(await collect(service.streamMessage(USER, YEAR, { message: 'Drei Punkte' }))).content).toBe(text)
  })

  it('shows the open steps of the last plan to the model in the next turn', async () => {
    const engine = new TurnByTurnEngine([[plan(firstPlanUpdated), ...answer('Arbeitsweg vorbereitet.')], answer('Weiter geht’s.')])
    const { service } = buildAdvisorTestKit(engine)
    await collect(service.streamMessage(USER, YEAR, { message: 'Drei Punkte' }))
    await collect(service.streamMessage(USER, YEAR, { message: 'Übernommen.' }))

    expect(engine.requests[0]!.openPlan).toBeUndefined()
    expect(engine.requests[1]!.openPlan).toEqual(firstPlanUpdated.slice(1))
  })

  it('carries an open plan past an answer that forgot to update it, and names it there too', async () => {
    const engine = new TurnByTurnEngine([[plan(firstPlanUpdated), ...answer('Arbeitsweg vorbereitet.')], answer('Die Krankenversicherung von Person B habe ich vorbereitet.'), answer('Ok.')])
    const { service, advisorRepo } = buildAdvisorTestKit(engine)
    await collect(service.streamMessage(USER, YEAR, { message: 'Drei Punkte' }))
    const second = reply(await collect(service.streamMessage(USER, YEAR, { message: 'Weiter' })))
    await collect(service.streamMessage(USER, YEAR, { message: 'Und?' }))

    expect(second.content).toContain('Noch offen: Krankenversicherung von Person B erfassen, Spenden erfassen.')
    expect(((await advisorRepo.listForUserAndYear(USER, YEAR))[3]!.meta as { plan?: unknown }).plan).toEqual(firstPlanUpdated)
    expect(engine.requests[2]!.openPlan).toEqual(firstPlanUpdated.slice(1))
  })

  it('stops once the plan is done: no line, nothing for the next turn', async () => {
    const done = firstPlan.map((step) => ({ ...step, status: 'erledigt' as const }))
    const engine = new TurnByTurnEngine([[plan(firstPlanUpdated), ...answer('Arbeitsweg vorbereitet.')], [plan(done), ...answer('Alles vorbereitet.')], answer('Ok.')])
    const { service } = buildAdvisorTestKit(engine)
    await collect(service.streamMessage(USER, YEAR, { message: 'Drei Punkte' }))
    const second = reply(await collect(service.streamMessage(USER, YEAR, { message: 'Weiter' })))
    await collect(service.streamMessage(USER, YEAR, { message: 'Danke' }))

    expect(second.content).toBe('Alles vorbereitet.')
    expect(engine.requests[2]!.openPlan).toBeUndefined()
  })
})
