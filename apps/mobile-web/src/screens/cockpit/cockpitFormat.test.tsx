import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { formatEuro, formatEuroRange } from '@steuereule/core'
import type { APP_NS } from '../../i18n/resources'
import { effectText, estimateMissingItems, heroDisplay, missingItemText, refundText } from './cockpitFormat'
import type { MissingItem } from './estimateMissing'

/** Echoes the key and its options, so a test reads which sentence was chosen with which values. */
const tr = ((key: string, options?: Record<string, unknown>) =>
  options === undefined ? key : `${key} ${JSON.stringify(options)}`) as unknown as TFunction<typeof APP_NS>

describe('refundText', () => {
  it('says the refund comes later without an estimate', () => {
    expect(refundText(null, tr, 'de')).toBe('cockpit.hero.refundLater')
  })

  it('names the open filing type before the count of missing details', () => {
    expect(refundText({ kind: 'offen', missing: ['veranlagungsart', 'lohnsteuer'] }, tr, 'de')).toBe('cockpit.erstattung.veranlagungsartOffen')
    expect(refundText({ kind: 'offen', missing: ['lohnsteuer', 'rente'] }, tr, 'de')).toBe('cockpit.erstattung.offen {"count":2}')
    expect(refundText({ kind: 'offen' }, tr, 'de')).toBe('cockpit.erstattung.offen {"count":0}')
  })

  it('gives the reason when no estimate is possible', () => {
    expect(refundText({ kind: 'nicht-moeglich' }, tr, 'de')).toBe('cockpit.erstattung.grund.unbekannt')
  })

  it('reads a range without width as one figure', () => {
    expect(refundText({ kind: 'spanne', result: { from: 31192, to: 31192 } }, tr, 'de')).toBe('cockpit.erstattung.erstattungRund {"betrag":"31.192"}')
    expect(refundText({ kind: 'spanne', result: { from: -500, to: -500 } }, tr, 'de')).toBe('cockpit.erstattung.nachzahlungRund {"betrag":"500"}')
  })

  it('distinguishes refund, back payment and an open result', () => {
    expect(refundText({ kind: 'spanne', result: { from: 100, to: 2000 } }, tr, 'de')).toBe('cockpit.erstattung.erstattung {"von":"100","bis":"2.000"}')
    expect(refundText({ kind: 'spanne', result: { from: -2000, to: -100 } }, tr, 'de')).toBe('cockpit.erstattung.nachzahlung {"von":"100","bis":"2.000"}')
    expect(refundText({ kind: 'spanne', result: { from: -300, to: 400 } }, tr, 'de')).toBe('cockpit.erstattung.offenesErgebnis {"nachzahlung":"300","erstattung":"400"}')
  })

  it('formats the figures for English', () => {
    expect(refundText({ kind: 'spanne', result: { from: 1500, to: 1500 } }, tr, 'en')).toBe('cockpit.erstattung.erstattungRund {"betrag":"1,500"}')
  })
})

describe('estimateMissingItems', () => {
  it('is empty unless the estimate is open', () => {
    expect(estimateMissingItems(null)).toEqual([])
    expect(estimateMissingItems({ kind: 'spanne', missing: ['lohnsteuer'] })).toEqual([])
    expect(estimateMissingItems({ kind: 'offen' })).toEqual([])
  })

  it('is empty while the filing type is the open point', () => {
    expect(estimateMissingItems({ kind: 'offen', missing: ['veranlagungsart', 'lohnsteuer'] })).toEqual([])
  })

  it('lists the missing details of an open estimate', () => {
    expect(estimateMissingItems({ kind: 'offen', missing: ['lohnsteuer'] }).map((item) => item.raw)).toEqual(['lohnsteuer'])
  })
})

describe('missingItemText', () => {
  const item = (overrides: Partial<MissingItem>): MissingItem => ({ id: 'lohnsteuer', raw: 'lohnsteuer', person: 'A', known: true, target: { kind: 'tile', tile: 'lstb' }, ...overrides })

  it('names the detail and the tile that holds it', () => {
    expect(missingItemText(item({}), tr, 'Alex')).toBe('cockpit.erstattung.fehlt.eigene {"was":"cockpit.erstattung.fehlt.lohnsteuer","wo":"cockpit.kachel.lstb.titel"}')
  })

  it('names only the detail without a mask', () => {
    expect(missingItemText(item({ target: null }), tr, 'Alex')).toBe('cockpit.erstattung.fehlt.ohneOrt {"was":"cockpit.erstattung.fehlt.lohnsteuer"}')
  })

  it('uses the generic wording for an unknown id', () => {
    expect(missingItemText(item({ known: false, target: null }), tr, 'Alex')).toBe('cockpit.erstattung.fehlt.ohneOrt {"was":"cockpit.erstattung.fehlt.sonstiges"}')
  })

  it('puts the partner name in front for Person B', () => {
    expect(missingItemText(item({ person: 'B', target: { kind: 'partner', area: 'lstb' } }), tr, 'Alex')).toBe(
      'cockpit.erstattung.fehlt.partner {"name":"Alex","was":"cockpit.erstattung.fehlt.lohnsteuer","wo":"cockpit.kachel.partner-lstb.titel"}',
    )
    expect(missingItemText(item({ person: 'B', target: null }), tr, 'Alex')).toBe('cockpit.erstattung.fehlt.partnerOhneOrt {"name":"Alex","was":"cockpit.erstattung.fehlt.lohnsteuer"}')
  })
})

describe('effectText', () => {
  it('says the direction without an area', () => {
    const direction = `cockpit.wirkung.mehr ${JSON.stringify({ betrag: formatEuro(120) })}`
    expect(effectText({ deltaEur: 120, area: null }, tr)).toBe(`cockpit.wirkung.ohneBereich ${JSON.stringify({ wirkung: direction })}`)
  })

  it('names area and form of the last opened tile', () => {
    const direction = `cockpit.wirkung.weniger ${JSON.stringify({ betrag: formatEuro(80) })}`
    expect(effectText({ deltaEur: -80, area: 'lstb' }, tr)).toBe(
      `cockpit.wirkung.mitBereich ${JSON.stringify({ bereich: 'cockpit.kachel.lstb.titel', formular: 'cockpit.kachel.lstb.formular', wirkung: direction })}`,
    )
  })
})

describe('heroDisplay', () => {
  it('shows a settled value as one figure', () => {
    expect(heroDisplay({ kind: 'bestimmt', value: 42000 }, 'offen')).toBe(formatEuro(42000))
    expect(heroDisplay({ kind: 'bestimmt' }, 'offen')).toBe(formatEuro(0))
  })

  it('says the income is open for a range from 0 €', () => {
    expect(heroDisplay({ kind: 'spanne', from: 0, to: 120 }, 'noch offen')).toBe('noch offen')
    expect(heroDisplay({ kind: 'spanne' }, 'noch offen')).toBe('noch offen')
  })

  it('shows a range above 0 €', () => {
    expect(heroDisplay({ kind: 'spanne', from: 30000, to: 32000 }, 'offen')).toBe(formatEuroRange(30000, 32000))
  })
})
