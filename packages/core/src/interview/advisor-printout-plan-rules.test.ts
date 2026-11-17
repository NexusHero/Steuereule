import { describe, expect, it } from 'vitest'
import { ENTRY_RULE_CODES } from './entry-rules'
import { planPrintoutGaps, printoutGapKey, printoutGapReads, type PrintoutGapContext } from './advisor-printout-plan'

const SINGLE: PrintoutGapContext = { joint: false, personB: null, children: [], rentals: [], personalDataConsent: false }
const JOINT: PrintoutGapContext = { ...SINGLE, joint: true, personB: { recordable: true } }

const key = (person: 'A' | 'B', screen: 'lstb' | 'commute' | 'chLohnausweis' | 'interview', field: string) => printoutGapKey({ person, screen, field })
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
})
