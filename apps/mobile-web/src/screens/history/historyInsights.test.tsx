// ADR-0099 — the hints of the Verlauf in words, against the mock's household: life events from data
// only (§4), what comes back every year with last year's amount as a hint (§2), cuts that come again
// (§5), the couple comparison in both directions and honest about its approximation (§6), and the
// group tabs only with data (§3, §7).
import { describe, expect, it } from 'vitest'
import { createAppI18n } from '../../i18n/app-i18n'
import { EMPTY_HISTORY_RESPONSE, HISTORY_ALL_GROUPS_RESPONSE, HISTORY_GAP_RESPONSE, HISTORY_RESPONSE } from '../../../test/test-history-fixture'
import { asksFiledElsewhere, coupleCopy, cutsOfYear, daysUntil, eventPhrase, eventsByYear, groupTabs, isLastChance, recurringLine, repeatedCutSentence } from './historyInsights'

const tr = createAppI18n('de').t
const en = createAppI18n('en').t
const plain = (s: string) => s.replace(/\u00a0/g, ' ')

describe('life events (§4)', () => {
  it('folds each year into one short phrase', () => {
    const byYear = eventsByYear(HISTORY_RESPONSE.events, tr)
    expect([...byYear.entries()]).toEqual([
      [2023, 'ab jetzt zusammen veranlagt'],
      [2024, 'neuer Arbeitgeber, Start als Grenzgänger'],
      [2025, 'Kind geboren'],
    ])
    expect(eventPhrase([{ year: 2025, kind: 'kind', person: null, count: 2 }], tr)).toBe('2 Kinder geboren')
    // The same event of both partners is said once.
    expect(eventPhrase([{ year: 2025, kind: 'umzug', person: 'A' }, { year: 2025, kind: 'umzug', person: 'B' }, { year: 2025, kind: 'immobilienkauf', person: null }], tr)).toBe('Umzug, Immobilie gekauft')
    expect(eventPhrase([{ year: 2025, kind: 'kind', person: null, count: 1 }], en)).toBe('child born')
  })
})

describe('a year without data (§1)', () => {
  it('asks only while the API says so, and knows the last chance to file', () => {
    const gap = HISTORY_GAP_RESPONSE.list.find((l) => l.year === 2022)!
    expect(asksFiledElsewhere(gap)).toBe(true)
    expect(asksFiledElsewhere({ ...gap, filedElsewhere: { answer: 'weiss-nicht', answeredOn: '2026-11-18', askAgainFrom: '2026-10-01', ask: false } })).toBe(false)
    expect(asksFiledElsewhere(HISTORY_RESPONSE.list.find((l) => l.year === 2024)!)).toBe(false)
    expect(isLastChance({ kind: 'offen', year: 2022, highlighted: false, filingDeadline: '2026-12-31' }, '2026-11-18')).toBe(true)
    expect(isLastChance({ kind: 'offen', year: 2025, highlighted: false, filingDeadline: '2029-12-31' }, '2026-11-18')).toBe(false)
    expect(daysUntil('2026-11-18', '2026-12-31')).toBe(43)
  })
})

describe('Kommt jedes Jahr wieder (§2)', () => {
  const item = (id: string) => HISTORY_RESPONSE.recurring!.items.find((i) => i.id === id)!

  it('names last year as a hint, what this year has, the receipt and the cuts that came again', () => {
    expect(plain(recurringLine(item('kontofuehrung'), 2026, tr))).toBe('2025: 32 € · 2026 eingetragen 32 €')
    expect(recurringLine(item('arbeitsweg'), 2026, tr)).toBe('2025: 67 km, 226 Tage · 2026 eingetragen 67 km, 226 Tage · aus Beleg übernommen')
    expect(recurringLine(item('homeoffice'), 2026, tr)).toBe('2025: 210 Tage · ⚠ 2023 und 2024 gekürzt')
    expect(plain(recurringLine(item('spenden'), 2026, tr))).toBe('2025: 3.135 € · Vorschlag aus Beleg wartet')
    expect(plain(recurringLine(item('spenden'), 2026, en))).toBe('2025: 3.135 € · a suggestion from a receipt waits')
  })
})

describe('Wiederholt gekürzt (§5)', () => {
  it('shows the pattern on the year it repeats in, counting only the years up to it', () => {
    expect(cutsOfYear(HISTORY_RESPONSE.repeatedCuts, 2023)).toEqual([])
    const [cut] = cutsOfYear(HISTORY_RESPONSE.repeatedCuts, 2024)
    expect(plain(repeatedCutSentence(cut!, 'Homeoffice-Pauschale', tr))).toBe('Zum zweiten Mal gekürzt: Homeoffice-Pauschale 2023 und 2024, je 180 € weniger anerkannt.')
    const three = { ...cut!, years: [...cut!.years, { year: 2025, declared: 1260, assessed: 1080, difference: -180, refundEffect: -56 }] }
    expect(plain(repeatedCutSentence(three, 'Homeoffice', tr))).toBe('Zum dritten Mal gekürzt: Homeoffice 2023, 2024 und 2025, je 180 € weniger anerkannt.')
    // Different amounts name each year; the amount is the deduction allowed less, not the tax effect.
    const uneven = { ...cut!, years: [...cut!.years, { year: 2025, declared: 1260, assessed: 960, difference: -300, refundEffect: -94 }] }
    expect(plain(repeatedCutSentence(uneven, 'Homeoffice', tr))).toBe('Zum dritten Mal gekürzt: Homeoffice 2023 (180 € weniger anerkannt), 2024 (180 € weniger anerkannt) und 2025 (300 € weniger anerkannt).')
  })
})

describe('Paare (§6)', () => {
  const couple = (year: number) => HISTORY_RESPONSE.couples.find((c) => c.year === year)!

  it('says what joint filing brought, approximately on a joint Bescheid with its range', () => {
    const copy = coupleCopy(couple(2024), tr)
    expect(plain(copy.text)).toBe('Zusammen veranlagt hat etwa 1.010 € bis 1.230 € gebracht.')
    expect(plain(copy.approximate!)).toBe('Rechnung der App, je nach Aufteilung der Abzüge')
    expect(copy.note).toBeNull()
  })

  it('says it the other way round for single returns and when single would have been better', () => {
    expect(plain(coupleCopy(couple(2022), tr).text)).toBe('Zusammen veranlagt wären es 640 € mehr gewesen.')
    expect(coupleCopy(couple(2022), tr).approximate).toBeNull()
    expect(plain(coupleCopy({ ...couple(2024), jointSaving: -300 }, tr).text)).toBe('Einzeln veranlagt wären es 300 € mehr gewesen.')
    expect(plain(coupleCopy({ ...couple(2022), jointSaving: -200 }, tr).text)).toBe('Einzeln veranlagt hat 200 € gebracht.')
    expect(coupleCopy({ ...couple(2024), jointSaving: 0, approximate: false }, tr).text).toBe('Zusammen oder einzeln macht keinen Unterschied.')
    expect(coupleCopy({ ...couple(2024), statement: 'zu-knapp' }, tr).note).toBe('Der Unterschied ist zu knapp für eine sichere Aussage.')
  })

  it('says what is missing or that the year has no tariff, without a number', () => {
    expect(coupleCopy({ year: 2021, status: 'tarif-fehlt' }, tr).text).toBe('Für 2021 rechnet die App den Vergleich zusammen ↔ einzeln nicht.')
    expect(coupleCopy({ year: 2025, status: 'unvollstaendig', missing: ['personB.lohnsteuerbescheinigung'] }, tr).text).toBe('Für den Vergleich zusammen ↔ einzeln fehlt noch: die Lohnsteuerbescheinigung von Person B.')
  })
})

describe('group tabs (§3, §7)', () => {
  it('offers a tab only where the household has data', () => {
    expect(groupTabs(HISTORY_RESPONSE)).toEqual(['schweiz', 'kapital'])
    expect(groupTabs(HISTORY_ALL_GROUPS_RESPONSE)).toEqual(['vorauszahlungen', 'schweiz', 'vermietung', 'kapital', 'rente'])
    expect(groupTabs(EMPTY_HISTORY_RESPONSE)).toEqual([])
  })
})
