import { describe, expect, it } from 'vitest'
import { ENTRY_RULE_CODES } from './entry-rules'
import { planPrintoutGaps, printoutGapKey, printoutGapReads, type PrintoutGapContext } from './advisor-printout-plan'

const SINGLE: PrintoutGapContext = { joint: false, personB: null, children: [], rentals: [], personalDataConsent: false }
const JOINT: PrintoutGapContext = { ...SINGLE, joint: true, personB: { recordable: true } }

const key = (person: 'A' | 'B', screen: 'lstb' | 'commute' | 'chLohnausweis' | 'interview' | 'kapital', field: string) => printoutGapKey({ person, screen, field })
const ANSWERED = { [key('A', 'interview', 'einkuenfte')]: 'Nein', [key('A', 'interview', 'vorauszahlungen-gate')]: 'Nein' }
const asked = (ctx: PrintoutGapContext, values: Record<string, string | null>) => planPrintoutGaps(ENTRY_RULE_CODES, ctx, values).questions.map((q) => q.key)

describe('checklist of the fixed rules (ADR-0093)', () => {
  it('keeps capital income and prepayments open until they are answered', () => {
    expect(asked(SINGLE, {})).toEqual([key('A', 'interview', 'einkuenfte'), key('A', 'interview', 'vorauszahlungen-gate')])
    expect(asked(SINGLE, ANSWERED)).toEqual([])
  })

  it('asks for the amount of prepayments after a yes', () => {
    const yes = { ...ANSWERED, [key('A', 'interview', 'vorauszahlungen-gate')]: 'Ja' }
    expect(asked(SINGLE, yes)).toEqual([key('A', 'interview', 'vorauszahlungen-betrag')])
    expect(asked(SINGLE, { ...yes, [key('A', 'interview', 'vorauszahlungen-betrag')]: '4800' })).toEqual([])
  })

  it('asks for Zeile 24 once Zeile 25 or 26 is filled, for each person', () => {
    const values = { ...ANSWERED, [key('A', 'lstb', 'kvArbeitnehmer')]: '3100', [key('B', 'lstb', 'pvArbeitnehmer')]: '700' }
    expect(asked(JOINT, values)).toEqual([key('A', 'lstb', 'zuschuesseKvPv'), key('B', 'lstb', 'zuschuesseKvPv')])
    expect(asked(JOINT, { ...values, [key('A', 'lstb', 'zuschuesseKvPv')]: '0', [key('B', 'lstb', 'zuschuesseKvPv')]: '350' })).toEqual([])
    expect(asked(SINGLE, values)).toEqual([key('A', 'lstb', 'zuschuesseKvPv')])
  })

  it('asks to confirm the shortest route for every recorded way', () => {
    const values = { ...ANSWERED, [key('A', 'commute', 'oneWayKm')]: '35', [key('A', 'commute', 'secondOneWayKm')]: '28' }
    expect(asked(SINGLE, values)).toEqual([key('A', 'commute', 'shortestRouteConfirmed'), key('A', 'commute', 'secondShortestRouteConfirmed')])
    expect(asked(SINGLE, { ...values, [key('A', 'commute', 'shortestRouteConfirmed')]: 'true', [key('A', 'commute', 'secondShortestRouteConfirmed')]: 'true' })).toEqual([])
  })

  it('asks per employer when a year has a German and a Swiss certificate and one way for all of it', () => {
    const values = {
      ...ANSWERED,
      [key('A', 'commute', 'oneWayKm')]: '40',
      [key('A', 'commute', 'shortestRouteConfirmed')]: 'true',
      [key('A', 'lstb', 'bruttoarbeitslohn')]: '60000',
      [key('A', 'chLohnausweis', 'bruttolohn-total')]: '12000',
      // The Swiss statement's own rule (paid-out sickness benefit) is answered; this test is about the way to work.
      [key('A', 'chLohnausweis', 'steuerfreiesKrankentaggeldChf')]: '0',
    }
    expect(asked(SINGLE, values)).toEqual([key('A', 'commute', 'periodFrom')])
    expect(asked(SINGLE, { ...values, [key('A', 'commute', 'periodFrom')]: '01.09.2024' })).toEqual([])
  })

  it('asks for the supplementary part of a Swiss health insurance amount', () => {
    const values = { ...ANSWERED, [key('A', 'chLohnausweis', 'krankenkasseChf')]: '4200' }
    expect(asked(SINGLE, values)).toEqual([key('A', 'chLohnausweis', 'krankenkasseZusatzChf')])
    expect(asked(SINGLE, { ...values, [key('A', 'chLohnausweis', 'krankenkasseZusatzChf')]: '0' })).toEqual([])
  })

  it('reads Person B only when there is one, and the owl may draft every rule field', () => {
    expect(printoutGapReads(ENTRY_RULE_CODES, SINGLE).some((read) => read.person === 'B')).toBe(false)
    expect(printoutGapReads(ENTRY_RULE_CODES, JOINT).some((read) => read.person === 'B')).toBe(true)
    expect(planPrintoutGaps(ENTRY_RULE_CODES, SINGLE, {}).questions.every((q) => q.owlMayDraft && q.required)).toBe(true)
  })

  it('asks once per Swiss wage statement whether a daily sickness benefit was paid out with the wage', () => {
    const paid = key('A', 'chLohnausweis', 'steuerfreiesKrankentaggeldChf')
    const values = { ...ANSWERED, [key('A', 'chLohnausweis', 'bruttolohn-total')]: '98000', [key('B', 'chLohnausweis', 'bruttolohn-total')]: '87000' }
    expect(asked(JOINT, values)).toEqual([paid, key('B', 'chLohnausweis', 'steuerfreiesKrankentaggeldChf')])
    expect(asked(SINGLE, values)).toEqual([paid])
    // An answer, also „0“, closes it; without a wage statement there is nothing to ask.
    expect(asked(SINGLE, { ...values, [paid]: '0' })).toEqual([])
    expect(asked(SINGLE, { ...values, [paid]: '9400' })).toEqual([])
    expect(asked(SINGLE, ANSWERED)).toEqual([])
    const question = planPrintoutGaps(ENTRY_RULE_CODES, SINGLE, values).questions[0]!
    expect(question.owlMayDraft).toBe(true)
    expect(question.question).toContain('Ziffer 8')
    expect(question.question).toContain('Taggeld')
  })

  it('asks for the amount of capital income once the gate says there is some', () => {
    const amount = key('A', 'kapital', 'kapitalertraege')
    const values = { ...ANSWERED, [key('A', 'interview', 'einkuenfte')]: 'Kapitalerträge' }
    expect(asked(SINGLE, values)).toEqual([amount])
    expect(asked(SINGLE, { ...values, [key('A', 'interview', 'einkuenfte')]: 'Beides' })).toEqual([amount])
    expect(asked(SINGLE, { ...values, [amount]: '1840' })).toEqual([])
    expect(asked(SINGLE, { ...values, [key('A', 'interview', 'einkuenfte')]: 'Vermietung' })).toEqual([])
  })

  it('asks for the Kindergeld of every recorded child that has none', () => {
    const ctx: PrintoutGapContext = { ...JOINT, children: ['Kind 1', 'Kind 2'], personalDataConsent: true }
    const claim = (record: string) => printoutGapKey({ person: 'A', screen: 'kind', field: 'childBenefitClaimEur', record })
    expect(asked(ctx, ANSWERED)).toEqual([claim('Kind 1'), claim('Kind 2')])
    expect(asked(ctx, { ...ANSWERED, [claim('Kind 1')]: '3060' })).toEqual([claim('Kind 2')])
    expect(asked(ctx, { ...ANSWERED, [claim('Kind 1')]: '3060', [claim('Kind 2')]: '0' })).toEqual([])
    expect(printoutGapReads(ENTRY_RULE_CODES, ctx).filter((read) => read.field === 'childBenefitClaimEur').map((read) => read.record)).toEqual(['Kind 1', 'Kind 2'])
    expect(planPrintoutGaps(ENTRY_RULE_CODES, ctx, ANSWERED).questions[0]!.question).toContain('Kindergeld')
  })

  it('names the tax year of the conversation in a question, never a fixed one', () => {
    const residence = (year: number) => planPrintoutGaps(['grenzgaenger'], { ...SINGLE, taxYear: year }, {}).questions.find((q) => q.field === 'ch-wohnsitz')!.question
    expect(residence(2024)).toContain('2024')
    expect(residence(2024)).not.toContain('2025')
    expect(residence(2025)).toContain('2025')
    expect(planPrintoutGaps(['grenzgaenger'], SINGLE, {}).questions.find((q) => q.field === 'ch-wohnsitz')!.question).not.toMatch(/20\d\d/)
  })
})
