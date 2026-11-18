import { describe, expect, it } from 'vitest'
import type { Answers } from '@steuereule/core'
import type { TileFacts } from '../cockpit/tiles'
import { nextOpenStep, slugOf, stepAfter, stepBefore, stepFromSlug, stepPosition, stromProgress, stromSteps, type StromStep } from './stromPlan'

const BASIS: Answers = { job: 'Angestellt', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig' }
const LSTB_DONE = {
  bruttoarbeitslohn: { kind: 'erfasst', value: 42000 },
  lohnsteuer: { kind: 'erfasst', value: 6000 },
  sozialversicherung: { kind: 'erfasst', value: 8000 },
}
const COMMUTE_DONE = { inputs: {}, workdays: {} }

function facts(answers: Answers, extra: Partial<TileFacts> = {}): TileFacts {
  return { path: 'angestellte', answers, masterData: null, ...extra } as TileFacts
}

const slugs = (steps: readonly StromStep[]) => steps.map(slugOf)

describe('the Strom order (ADR-0089)', () => {
  it('is only the basis page while the basis is open', () => {
    expect(slugs(stromSteps({}, null))).toEqual(['basis'])
    expect(nextOpenStep({ job: 'Angestellt' }, null)).toEqual({ kind: 'basis' })
  })

  it('puts the documents first, then the selection, the chosen topics and the summary', () => {
    const answers: Answers = { ...BASIS, spenden: 'Ja', 'kv-pv': 'Ja', nebenjob: 'Minijob', umzug: 'Nein' }
    expect(slugs(stromSteps(answers, facts(answers)))).toEqual([
      'basis',
      'lohnsteuerbescheinigung',
      'arbeitsweg',
      'auswahl',
      'krankenversicherung',
      'spenden',
      'fertig',
    ])
  })

  it('adds the children and Alleinerziehend where they apply', () => {
    const answers: Answers = { ...BASIS, kinder: '1 Kind', familienstand: 'Geschieden oder getrennt' }
    const steps = slugs(stromSteps(answers, facts(answers)))
    expect(steps).toContain('kinder')
    expect(steps.indexOf('alleinerziehend')).toBe(steps.length - 2)
  })

  it('"Weiter" leads to the first open step: a missing certificate, then the selection, then an open topic', () => {
    const answers: Answers = { ...BASIS }
    expect(nextOpenStep(answers, facts(answers))).toEqual({ kind: 'maske', id: 'lstb' })
    const withDocs = facts(answers, { lstb: LSTB_DONE, commute: COMMUTE_DONE } as Partial<TileFacts>)
    expect(nextOpenStep(answers, withDocs)).toEqual({ kind: 'auswahl' })
  })

  it('returns to a topic whose amount was left for later, and to the summary once nothing is open', () => {
    const decided: Answers = { ...BASIS, fortbildung: 'Nein', umzug: 'Nein', dhf: 'Nein', nebenjob: 'Nein', lohnersatz: 'Nein', abfindung: 'Nein', 'haushalt-gate': 'Nein', 'kv-pv': 'Nein', riester: 'Nein', 'gesundheit-gate': 'Nein', einkuenfte: 'Nein', 'vorauszahlungen-gate': 'Nein' }
    const later: Answers = { ...decided, spenden: 'Ja', 'spenden-betrag': 'spaeter' }
    const done = { lstb: LSTB_DONE, commute: COMMUTE_DONE } as Partial<TileFacts>
    expect(nextOpenStep(later, facts(later, done))).toEqual({ kind: 'thema', id: 'spenden' })
    const finished: Answers = { ...decided, spenden: 'Ja', 'spenden-betrag': '300' }
    expect(nextOpenStep(finished, facts(finished, done))).toEqual({ kind: 'fertig' })
  })

  it('a cross-border commuter who changed job in the year also gets the German LStB, right after the way to work (ADR-0079)', () => {
    const ch: Answers = { ...BASIS, ausland: 'Ja, in die Schweiz', 'de-job': 'Nur in der Schweiz' }
    const chFacts = (extra: Partial<TileFacts>) => ({ path: 'ch', answers: ch, masterData: null, ...extra }) as TileFacts
    // A whole year in Switzerland: no German certificate.
    expect(slugs(stromSteps(ch, chFacts({})))).toEqual(['basis', 'schweiz', 'arbeitsweg', 'auswahl', 'fertig'])
    // The way-to-work mask records the change of job: the German certificate joins the Strom, and is open.
    const changed = chFacts({ commute: { inputs: { secondFrom: '01.11.2024', secondOneWayKm: 82 }, workdays: {} } } as Partial<TileFacts>)
    expect(slugs(stromSteps(ch, changed))).toEqual(['basis', 'schweiz', 'arbeitsweg', 'lohnsteuerbescheinigung', 'auswahl', 'fertig'])
    expect(nextOpenStep(ch, { ...changed, ch: { foldStatus: { kind: 'bestimmt' }, exchangeRate: 1 } } as unknown as TileFacts)).toEqual({ kind: 'maske', id: 'lstb' })
    // A certificate already entered (scan, owl) counts as a change too.
    expect(slugs(stromSteps(ch, chFacts({ lstb: LSTB_DONE } as Partial<TileFacts>)))).toContain('lohnsteuerbescheinigung')
  })

  it('suggests nothing while a mask is still loading', () => {
    expect(nextOpenStep(BASIS, facts(BASIS, { pendingTiles: new Set(['lstb']) } as Partial<TileFacts>))).toBeNull()
  })

  it('moves forward and back in order, and counts the steps without the summary', () => {
    const answers: Answers = { ...BASIS, spenden: 'Ja' }
    const f = facts(answers)
    expect(stepAfter({ kind: 'auswahl' }, answers, f)).toEqual({ kind: 'thema', id: 'spenden' })
    expect(stepBefore({ kind: 'auswahl' }, answers, f)).toEqual({ kind: 'maske', id: 'arbeitsweg' })
    expect(stepBefore({ kind: 'basis' }, answers, f)).toBeNull()
    expect(stepPosition({ kind: 'auswahl' }, answers, f)).toEqual({ index: 4, total: 5 })
  })

  it('every step has an address segment that leads back to it', () => {
    const answers: Answers = { ...BASIS, kinder: '1 Kind', familienstand: 'Ledig', spenden: 'Ja', 'kv-pv': 'Ja', 'haushalt-gate': 'Ja' }
    for (const step of stromSteps(answers, facts(answers))) {
      expect(stepFromSlug(slugOf(step))).toEqual(step)
    }
    expect(stepFromSlug('gibt-es-nicht')).toBeNull()
  })
})

describe('stromProgress — how far the user is (UX review 2026-11)', () => {
  it('counts the answered steps out of all of them, without the summary', () => {
    expect(stromProgress(BASIS, facts(BASIS))).toEqual({ done: 1, total: 4 })
    expect(stromProgress(BASIS, facts(BASIS, { lstb: LSTB_DONE } as Partial<TileFacts>))).toEqual({ done: 2, total: 4 })
  })

  it('gives no count before the basis is answered or while a mask is still loading', () => {
    expect(stromProgress({}, null)).toBeNull()
    expect(stromProgress(BASIS, facts(BASIS, { pendingTiles: new Set(['lstb']) } as Partial<TileFacts>))).toBeNull()
  })
})

describe('the German job of a cross-border commuter, asked in the basis (Echtdatentest 18.11.2026)', () => {
  const ch: Answers = { ...BASIS, ausland: 'Ja, in die Schweiz', 'de-job': 'Auch in Deutschland' }
  const chFacts = (extra: Partial<TileFacts> = {}) => ({ path: 'ch', answers: ch, masterData: null, ...extra }) as TileFacts

  it('puts the German LStB into the Strom right after the way to work, without a job change in the commute', () => {
    expect(slugs(stromSteps(ch, chFacts()))).toEqual(['basis', 'schweiz', 'arbeitsweg', 'lohnsteuerbescheinigung', 'auswahl', 'fertig'])
  })
})

describe('Person B in the Strom (Echtdatentest 18.11.2026)', () => {
  const MARRIED: Answers = { job: 'Angestellt', ausland: 'Ja, in die Schweiz', 'de-job': 'Nur in der Schweiz', kinder: '1 Kind', familienstand: 'Verheiratet', 'partner-job': 'Angestellt', 'partner-ausland': 'Ja, in die Schweiz', 'partner-de-job': 'Nur in der Schweiz' }
  const JOINT = { joint: true, name: 'Büsra', birthDate: '1991-10-17' }
  const married = (answers: Answers, partner: Partial<NonNullable<TileFacts['partner']>> | null, extra: Partial<TileFacts> = {}) =>
    ({ path: 'ch', answers, masterData: null, partner: partner === null ? null : { joint: true, name: null, birthDate: null, ...partner }, ...extra }) as TileFacts

  it('asks the partner name right after the basis and the masks of B after the own ones, before the children', () => {
    expect(slugs(stromSteps(MARRIED, married(MARRIED, {})))).toEqual([
      'basis',
      'partner',
      'schweiz',
      'arbeitsweg',
      'partner-schweiz',
      'partner-arbeitsweg',
      'kinder',
      'auswahl',
      'fertig',
    ])
  })

  it('gives B the German LStB when B also worked in Germany, and the masks of an employee in Germany or a pensioner', () => {
    const deToo: Answers = { ...MARRIED, 'partner-de-job': 'Auch in Deutschland' }
    expect(slugs(stromSteps(deToo, married(deToo, JOINT)))).toContain('partner-lohnsteuerbescheinigung')
    const germanB: Answers = { ...MARRIED, 'partner-ausland': 'Nein' }
    delete (germanB as Record<string, unknown>)['partner-de-job']
    expect(slugs(stromSteps(germanB, married(germanB, JOINT))).filter((s) => s.startsWith('partner-'))).toEqual(['partner-lohnsteuerbescheinigung', 'partner-arbeitsweg'])
    const retiredB: Answers = { ...MARRIED, 'partner-job': 'Rente' }
    expect(slugs(stromSteps(retiredB, married(retiredB, JOINT))).filter((s) => s.startsWith('partner-'))).toEqual(['partner-rente'])
    const noJob: Answers = { ...MARRIED, 'partner-job': 'Nicht berufstätig' }
    expect(slugs(stromSteps(noJob, married(noJob, JOINT))).filter((s) => s.startsWith('partner-'))).toEqual([])
  })

  it('leaves Person B out when the couple files separately or B has an account of their own', () => {
    expect(slugs(stromSteps(MARRIED, married(MARRIED, { ...JOINT, joint: false }))).some((s) => s.startsWith('partner'))).toBe(false)
    expect(slugs(stromSteps(MARRIED, married(MARRIED, null))).some((s) => s.startsWith('partner'))).toBe(false)
  })

  it('the name step is open until first name and birth date are there; the masks of B count like those of A', () => {
    const own = { ch: { foldStatus: { kind: 'bestimmt' }, exchangeRate: 1 }, commute: COMMUTE_DONE, children: { kinder: [{}] } } as unknown as Partial<TileFacts>
    expect(nextOpenStep(MARRIED, married(MARRIED, { name: 'Büsra' }, own))).toEqual({ kind: 'partner' })
    expect(nextOpenStep(MARRIED, married(MARRIED, JOINT, own))).toEqual({ kind: 'maske', id: 'ch', person: 'B' })
    const bDone = married(MARRIED, { ...JOINT, ch: { foldStatus: { kind: 'bestimmt' }, exchangeRate: 1 }, commute: COMMUTE_DONE } as never, own)
    expect(nextOpenStep(MARRIED, bDone)).toEqual({ kind: 'auswahl' })
    expect(stromProgress(MARRIED, married(MARRIED, JOINT, own))).toEqual({ done: 5, total: 8 })
  })

  it('suggests nothing while the data of B is still loading', () => {
    expect(nextOpenStep(MARRIED, married(MARRIED, { ...JOINT, pending: true }))).toBeNull()
    expect(stromProgress(MARRIED, married(MARRIED, { ...JOINT, pending: true }))).toBeNull()
  })

  it('every partner step has an address segment that leads back to it', () => {
    const deToo: Answers = { ...MARRIED, 'partner-de-job': 'Auch in Deutschland' }
    for (const step of stromSteps(deToo, married(deToo, JOINT))) expect(stepFromSlug(slugOf(step))).toEqual(step)
  })
})
