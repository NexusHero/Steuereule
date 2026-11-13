import { describe, expect, it } from 'vitest'
import type { AdvisorEnginePort, AdvisorOpeningBrief, AdvisorStreamEvent, AdvisorTurnRequest, AdvisorTurnResult, CaseDigest } from '@steuereule/core'
import { AdvisorOpening, openingStream } from '../src/advisor/advisor-opening.js'
import { furtherFactsOf } from '../src/advisor/advisor-case-facts.js'
import type { AdvisorChatMessageRecord, AdvisorRepository } from '../src/advisor/advisor.repository.js'
import type { RentalObjectRecord } from '../src/rental/rental.repository.js'

const BRIEF: AdvisorOpeningBrief = { stage: 'ready', gaps: [], figures: [{ id: 'homeoffice-pauschale', label: 'Homeoffice', amountEur: 528 }] }
const REQUEST = { message: 'x', digest: {} as CaseDigest } as AdvisorTurnRequest

function result(replyText: string, meta: AdvisorTurnResult['meta'] = {}): AdvisorTurnResult {
  return { replyText, meta, mode: 'langgraph' }
}

/** An engine that answers each call with the next scripted list of events. */
function scriptedEngine(...turns: AdvisorStreamEvent[][]): AdvisorEnginePort & { readonly requests: AdvisorTurnRequest[] } {
  const requests: AdvisorTurnRequest[] = []
  return {
    requests,
    async *streamTurn(request: AdvisorTurnRequest) {
      requests.push(request)
      yield* turns[requests.length - 1] ?? []
    },
  } as unknown as AdvisorEnginePort & { readonly requests: AdvisorTurnRequest[] }
}

async function collect(stream: AsyncIterable<AdvisorStreamEvent>): Promise<AdvisorStreamEvent[]> {
  const events: AdvisorStreamEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

const UNBACKED = { kind: 'unbacked-amount' as const, text: 'nicht berechnet', amounts: [1_200] }

describe('openingStream', () => {
  it('runs the opening task with the brief, without a forced plan', async () => {
    const engine = scriptedEngine([{ event: 'done', data: result('Hallo') }])
    await collect(openingStream(engine, REQUEST, BRIEF))
    expect(engine.requests[0]).toMatchObject({ task: 'opening', opening: BRIEF, planRequired: false })
  })

  it('holds the text back and writes it once more when it names an amount the app did not compute', async () => {
    const engine = scriptedEngine(
      [{ event: 'token', data: { text: 'Du sparst 1.200 €.' } }, { event: 'done', data: result('Du sparst 1.200 €.', { notices: [UNBACKED] }) }],
      [{ event: 'token', data: { text: 'Homeoffice bringt 528 €.' } }, { event: 'done', data: result('Homeoffice bringt 528 €.') }],
    )
    const events = await collect(openingStream(engine, REQUEST, BRIEF))
    expect(engine.requests).toHaveLength(2)
    expect(engine.requests[1]!.opening?.unbackedAmounts).toEqual([1_200])
    const tokens = events.filter((event) => event.event === 'token').map((event) => (event.data as { text: string }).text)
    expect(tokens).toEqual(['Homeoffice bringt 528 €.'])
    expect(events.some((event) => event.event === 'status')).toBe(true)
  })

  it('tries only once more: a second miss stays with its notice', async () => {
    const engine = scriptedEngine(
      [{ event: 'done', data: result('A 1.200 €', { notices: [UNBACKED] }) }],
      [{ event: 'done', data: result('B 1.200 €', { notices: [UNBACKED] }) }],
    )
    const events = await collect(openingStream(engine, REQUEST, BRIEF))
    expect(engine.requests).toHaveLength(2)
    const done = events.find((event) => event.event === 'done')!.data as AdvisorTurnResult
    expect(done.replyText).toBe('B 1.200 €')
    expect(done.meta.notices).toEqual([UNBACKED])
  })

  it('lets no draft out of an opening', async () => {
    const action = { actionId: 'a1' } as never
    const engine = scriptedEngine([{ event: 'action', data: action }, { event: 'done', data: result('Text', { action, actions: [action] }) }])
    const events = await collect(openingStream(engine, REQUEST, BRIEF))
    expect(events.some((event) => event.event === 'action')).toBe(false)
    const done = events.find((event) => event.event === 'done')!.data as AdvisorTurnResult
    expect(done.meta.action).toBeUndefined()
    expect(done.meta.actions).toBeUndefined()
  })

  it('passes an error on and stops', async () => {
    const engine = scriptedEngine([{ event: 'error', data: { code: 'X', message: 'kaputt' } }])
    const events = await collect(openingStream(engine, REQUEST, BRIEF))
    expect(events).toEqual([{ event: 'error', data: { code: 'X', message: 'kaputt' } }])
    expect(engine.requests).toHaveLength(1)
  })
})

function digestWith(gross: number | null, answers: Record<string, string>): CaseDigest {
  return {
    taxYear: 2026,
    filingStatus: 'einzel',
    lstbPersonA: { grossWageEur: gross, wageTaxEur: null, socialSecurityEur: null },
    crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
    commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: null, distanceKm: null },
    catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
    childrenCount: 0,
    rentalObjectsCount: 0,
    capitalGainEur: null,
    priorYearComparison: { donationsEur: null },
    openOwlHints: [],
    printoutMissingFields: [],
    estimatedRefundEur: null,
    furtherFacts: furtherFactsOf(2026, answers, null, [], null),
  }
}

function openingWith(digest: CaseDigest, messages: Partial<AdvisorChatMessageRecord>[]): AdvisorOpening {
  const repo = {
    listNotes: async () => [],
    listForUserAndYear: async () => messages as AdvisorChatMessageRecord[],
  } as unknown as AdvisorRepository
  return new AdvisorOpening(repo, async () => digest, async () => '', undefined)
}

describe('AdvisorOpening.state', () => {
  const ready = digestWith(52_000, { partner: 'Nein' })

  it('does not open an empty year', async () => {
    expect(await openingWith(digestWith(null, {}), []).state('u', 2026)).toEqual({ stage: 'empty', shouldOpen: false, lastOpening: null })
  })

  it('opens when there was no opening yet', async () => {
    expect(await openingWith(ready, []).state('u', 2026)).toMatchObject({ stage: 'ready', shouldOpen: true, lastOpening: null })
  })

  it('links to the last opening instead of opening again while nothing changed', async () => {
    const { fingerprint } = await openingWith(ready, []).context('u', 2026)
    const last = { role: 'assistant' as const, status: 'complete' as const, conversationId: 'c1', createdAt: new Date('2026-11-13T09:00:00Z'), meta: { opening: { fingerprint, stage: 'ready' as const } } }
    expect(await openingWith(ready, [last]).state('u', 2026)).toEqual({
      stage: 'ready',
      shouldOpen: false,
      lastOpening: { conversationId: 'c1', createdAt: '2026-11-13T09:00:00.000Z' },
    })
  })

  it('does not start a second opening while the first is still being written', async () => {
    const { fingerprint } = await openingWith(ready, []).context('u', 2026)
    const running = { role: 'assistant' as const, status: 'streaming' as const, conversationId: 'c1', createdAt: new Date(), meta: { opening: { fingerprint, stage: 'ready' as const } } }
    expect((await openingWith(ready, [running]).state('u', 2026)).shouldOpen).toBe(false)
  })

  it('opens again once the case changed', async () => {
    const last = { role: 'assistant' as const, status: 'complete' as const, conversationId: 'c1', createdAt: new Date(), meta: { opening: { fingerprint: 'older000', stage: 'ready' as const } } }
    expect((await openingWith(ready, [last]).state('u', 2026)).shouldOpen).toBe(true)
  })
})

describe('furtherFactsOf', () => {
  const rental = (rent: string | null, costs: string | null, interest: string | null): RentalObjectRecord =>
    ({ id: 'r', userId: 'u', taxYear: 2026, mieteinnahmen: rent, anschaffungskosten: null, baujahr: null, werbungskosten: costs, schuldzinsen: interest }) as RentalObjectRecord

  it('sums the rental figures that are entered and leaves the rest open', () => {
    const facts = furtherFactsOf(2026, {}, null, [rental('9600', '1200', null), rental('6000', 'unklar', '800')], null)
    expect(facts.rentals).toEqual({ rentEur: 15_600, expensesEur: 1_200, loanInterestEur: 800 })
  })

  it('takes an amount only behind a yes', () => {
    const facts = furtherFactsOf(2026, { nebenjob: 'Nein', 'nebenjob-brutto': '5000', abfindung: 'Ja', 'abfindung-betrag': '20000' }, null, [], null)
    expect(facts.sideJobGrossEur).toBeNull()
    expect(facts.severanceEur).toBe(20_000)
  })

  it('knows whether the assessment was asked and gives the deadlines', () => {
    expect(furtherFactsOf(2026, {}, null, [], null)).toMatchObject({ filingStatusAnswered: false, answeredQuestions: 0 })
    const facts = furtherFactsOf(2026, { partner: 'Ja' }, null, [], null)
    expect(facts.filingStatusAnswered).toBe(true)
    expect(facts.filingDeadline).toMatch(/^2027-/)
  })

  it('reads the pension without its start year or age', () => {
    const facts = furtherFactsOf(2026, {}, { userId: 'u', taxYear: 2026, rentenart: 'gesetzlich', jahresbetrag: '18000', rentenbeginnJahr: '2019', alterBeiRentenbeginn: '65' }, [], null)
    expect(facts.pension).toEqual({ kind: 'gesetzlich', annualEur: 18_000 })
  })
})

describe('the opening prompt', () => {
  const digest = digestWith(52_000, { partner: 'Nein' })

  it('lists the app’s figures as the only amounts and forbids drafts', async () => {
    const { taskPrompt } = await import('../src/ki/advisor-tasks.js')
    const text = taskPrompt('opening', digest, undefined, BRIEF)
    expect(text).toContain('Homeoffice: 528 €')
    expect(text).toContain('Nenne nur Beträge aus dieser Liste')
    expect(text).toContain('keine Entwürfe')
  })

  it('asks for the gaps with a question round while the case is incomplete', async () => {
    const { taskPrompt } = await import('../src/ki/advisor-tasks.js')
    const text = taskPrompt('opening', digest, undefined, { stage: 'partial', gaps: ['Veranlagung: allein oder zusammen'], figures: [] })
    expect(text).toContain('`ask_questions`')
    expect(text).toContain('- Veranlagung: allein oder zusammen')
  })

  it('names the amounts of the first attempt on the second', async () => {
    const { taskPrompt } = await import('../src/ki/advisor-tasks.js')
    expect(taskPrompt('opening', digest, undefined, { ...BRIEF, unbackedAmounts: [1_200] })).toContain('nannte 1.200 €')
  })
})
