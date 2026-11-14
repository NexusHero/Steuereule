import { describe, expect, it } from 'vitest'
import type { Answers } from '@steuereule/core'
import type { TileFacts } from '../cockpit/tiles'
import { nextOpenStep, slugOf, stepAfter, stepBefore, stepFromSlug, stepPosition, stromSteps, type StromStep } from './stromPlan'

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
    const ch: Answers = { ...BASIS, ausland: 'Ja, in die Schweiz' }
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
