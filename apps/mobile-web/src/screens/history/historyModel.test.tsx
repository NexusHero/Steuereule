// ADR-0098 — the pure pieces of the Verlauf: how a figure, a change and what is missing are worded
// (§3: a range stays a range, an open year has no number), how the chart columns follow the tiers,
// the owl's sentence built only from the numbers (§7), and the timeline's one phrase and one amount per
// year with the single most urgent item (§1, alternative A).
import { describe, expect, it } from 'vitest'
import { createAppI18n } from '../../i18n/app-i18n'
import { HISTORY_RESPONSE, HISTORY_YEARS, est, fig, open } from '../../test-history-fixture'
import { buildChart, niceTicks, sparkPoints } from './historyChartModel'
import { deltaText, deltaTone, figureText, missingSentence, signedEuro, signedFigureText } from './historyFormat'
import { owlSentence } from './owlSentences'
import { declaredAmount, filingTypeChange, missingDetail, missingShort, urgentFirst, yearAmount, yearStatus } from './historyTimeline'

const tr = createAppI18n('de').t
const en = createAppI18n('en').t
const plain = (s: string) => s.replace(/ /g, ' ')

describe('historyFormat', () => {
  it('signs euros with a real minus and ± for zero', () => {
    expect(plain(signedEuro(809))).toBe('+809 €')
    expect(plain(signedEuro(-92))).toBe('−92 €')
    expect(plain(signedEuro(0))).toBe('±0 €')
  })

  it('shows a Bescheid value exactly, an estimate as its range and never a midpoint, an open figure as open', () => {
    expect(plain(figureText(fig(1230), 'euro', 'noch offen'))).toBe('1.230 €')
    expect(plain(figureText(est(1180, 1420), 'euro', 'noch offen'))).toBe('1.180–1.420 €')
    expect(figureText(open(), 'euro', 'noch offen')).toBe('noch offen')
    expect(plain(signedFigureText(est(1066, 1196), '–'))).toBe('+1.066–1.196 €')
    expect(plain(figureText(fig(13.6), 'percent', '–'))).toBe('13,6 %')
  })

  it('words the change to the previous year by its kind', () => {
    expect(plain(deltaText({ kind: 'exact', absolute: 599, percent: 285.2 }, 'euro', tr))).toBe('+599 € (+285,2 %) zum Vorjahr')
    expect(plain(deltaText({ kind: 'range', absoluteRange: { from: 257, to: 387 } }, 'euro', tr))).toBe('+257 € bis +387 € zum Vorjahr')
    expect(deltaText({ kind: 'none', reason: 'veranlagungsart-gewechselt' }, 'euro', tr)).toBe('kein Vergleich: Veranlagungsart gewechselt')
    expect(deltaText({ kind: 'none', reason: 'offen' }, 'euro', tr)).toBe('kein Vorjahresvergleich: ein Jahr ist noch offen')
    expect(plain(deltaText({ kind: 'exact', absolute: -0.8, percent: null }, 'percent', tr))).toBe('−0,8 Pp. zum Vorjahr')
  })

  it('colours a falling tax rate as good news and a falling refund as bad', () => {
    expect(deltaTone({ kind: 'exact', absolute: -0.8 }, true)).toBe('good')
    expect(deltaTone({ kind: 'exact', absolute: -92 }, false)).toBe('bad')
    expect(deltaTone({ kind: 'range', absoluteRange: { from: -10, to: 20 } }, false)).toBe('neutral')
    expect(deltaTone({ kind: 'none', reason: 'offen' }, false)).toBe('neutral')
  })

  it('turns the missing ids into a German sentence, the partner named, unknown ids folded into „weitere Angaben“', () => {
    expect(missingSentence(['lohnsteuerbescheinigung', 'personB.lohnsteuerbescheinigung'], tr)).toBe('Noch offen: die Lohnsteuerbescheinigung und die Lohnsteuerbescheinigung von Person B.')
    expect(missingSentence(['bruttoarbeitslohn', 'zeile-17', 'zeile-18'], tr)).toBe('Noch offen: der Bruttoarbeitslohn und weitere Angaben.')
    expect(missingSentence([], tr)).toBe('Noch offen.')
    expect(missingSentence(['wechselkurs'], en)).toBe('Still open: the exchange rate.')
  })
})

describe('buildChart', () => {
  it('opens with the refund: Bescheid years as bars with the declared mark, the estimate as a range, the open year as a gap', () => {
    const model = buildChart(HISTORY_YEARS, 'erstattung', 'beide')
    expect(model.columns.map((c) => c.kind)).toEqual(['refund', 'refund', 'refund', 'refund', 'range', 'gap'])
    const y2024 = model.columns[3]!
    expect(y2024).toMatchObject({ kind: 'refund', value: 809, declared: 901 })
    expect(y2024.kind === 'refund' && plain(y2024.cutLabel ?? '')).toBe('−92 €')
    expect(model.columns[4]).toMatchObject({ kind: 'range', from: 1066, to: 1196 })
    expect(model.filingTypeChanges).toEqual([{ year: 2023, filingType: 'zusammen' }])
    expect(model.min).toBe(0)
    expect(model.max).toBeGreaterThanOrEqual(1196)
  })

  it('stacks the Werbungskosten by part with the Pauschbetrag line, and an Eckjahr as one sum „laut Bescheid“', () => {
    const model = buildChart(HISTORY_YEARS, 'werbungskosten', 'A')
    const eck = model.columns[0]!
    expect(eck.kind === 'stack' && eck.segments.map((s) => s.kind)).toEqual(['summeLautBescheid'])
    const y2025 = model.columns[4]!
    expect(y2025).toMatchObject({ kind: 'stack', estimated: true, line: 1230 })
    expect(y2025.kind === 'stack' && y2025.segments.map((s) => s.value)).toEqual([1380, 1260, 520, 250])
    // The marker of the Veranlagungsart belongs to the household view only.
    expect(model.filingTypeChanges).toEqual([])
  })

  it('shows Brutto → Netto as facts and marks the Eckjahr without wages as „nicht ablesbar“', () => {
    const model = buildChart(HISTORY_YEARS, 'netto', 'beide')
    expect(model.columns[0]).toEqual({ year: 2021, kind: 'gap', reason: 'nichtAblesbar' })
    expect(model.columns[4]).toMatchObject({ kind: 'stack', estimated: false })
    expect(model.columns[5]).toEqual({ year: 2026, kind: 'gap', reason: 'offen' })
  })

  it('keeps Erstattung and Steuerquote for the household whatever person is picked', () => {
    expect(buildChart(HISTORY_YEARS, 'steuerquote', 'B').columns.map((c) => c.kind)).toEqual(['gap', 'quote', 'quote', 'quote', 'quote', 'gap'])
    expect(buildChart(HISTORY_YEARS, 'erstattung', 'B').filingTypeChanges).toHaveLength(1)
  })

  it('makes round ticks and leaves a mini trend out with fewer than two points', () => {
    expect(niceTicks(0, 1340)).toEqual([0, 500, 1000, 1500])
    expect(niceTicks(-200, 900)).toEqual([-250, 0, 250, 500, 750, 1000])
    expect(sparkPoints([null, { from: 1, to: 1 }])).toBe('')
    expect(sparkPoints([{ from: 0, to: 0 }, null, { from: 10, to: 10 }])).toBe('4.0,19.0 96.0,3.0')
  })
})

describe('owlSentence', () => {
  it('sums up the refunds from the numbers: how many came back as declared, the cut, the estimate', () => {
    const text = plain(owlSentence('erstattung', HISTORY_YEARS, HISTORY_RESPONSE.list, 'beide', tr))
    expect(text).toContain('Von 3 Erklärungen aus SteuerEule kamen 2 wie erklärt zurück.')
    expect(text).toContain('2024 hat das Finanzamt 92 € gekürzt.')
    expect(text).toContain('Für 2025 schätzt die Eule +1.066–1.196 €.')
    expect(text).toContain('2021 und 2022 sind die Summe zweier Einzelerklärungen.')
  })

  it('names the years below the Pauschbetrag and the largest part, and never forecasts', () => {
    const text = plain(owlSentence('werbungskosten', HISTORY_YEARS, HISTORY_RESPONSE.list, 'beide', tr))
    expect(text).toContain('Unter dem Pauschbetrag lagen')
    expect(text).toContain('Person B 2022 (1.100 €)')
    expect(text).toContain('2025 bringt der Fahrtweg am meisten (2.460 €).')
    expect(text).not.toMatch(/2026|2027/)
  })

  it('words Brutto → Netto and the tax rate from the first and the latest known year', () => {
    expect(plain(owlSentence('netto', HISTORY_YEARS, HISTORY_RESPONSE.list, 'A', tr))).toMatch(/^Das Brutto veränderte sich von 2022 bis 2025 um \+21,0 %, das Netto um \+/)
    expect(plain(owlSentence('steuerquote', HISTORY_YEARS, HISTORY_RESPONSE.list, 'beide', tr))).toBe('2024 gingen von jedem zusätzlichen Euro rund 31 Cent an Einkommensteuer; im Schnitt waren es 13,0 % des Brutto.')
  })

  it('says honestly when there is nothing to say yet', () => {
    expect(owlSentence('netto', [], [], 'beide', tr)).toBe('Für Brutto → Netto fehlt noch eine Lohnsteuerbescheinigung.')
    expect(owlSentence('erstattung', [], [], 'beide', tr)).toBe('Noch hat kein Jahr einen Bescheid oder eine Schätzung.')
  })
})

describe('historyTimeline', () => {
  const item = (year: number) => HISTORY_RESPONSE.list.find((l) => l.year === year)!
  const entry = (year: number) => HISTORY_YEARS.find((y) => y.year === year)
  const status = (year: number) => {
    const st = yearStatus(item(year), entry(year), tr)
    return { ...st, text: plain(st.text) }
  }

  it('puts the highlighted deadline first, then deadlines, waiting years and open years, newer first', () => {
    expect(urgentFirst(HISTORY_RESPONSE.openItems).map((o) => `${o.kind}-${o.year}`)).toEqual(['einspruchsfrist-2024', 'wartet-auf-bescheid-2025', 'offen-2026'])
    const items = [
      { kind: 'offen' as const, year: 2026, highlighted: false },
      { kind: 'wartet-auf-bescheid' as const, year: 2024, highlighted: false },
      { kind: 'wartet-auf-bescheid' as const, year: 2025, highlighted: false },
    ]
    expect(urgentFirst(items).map((o) => o.year)).toEqual([2025, 2024, 2026])
  })

  it('words each year in one plain phrase, the cut in the danger tone only', () => {
    expect(status(2026)).toEqual({ text: 'in Arbeit · 2 Lohnsteuerbescheinigungen fehlen', tone: null })
    expect(status(2025)).toEqual({ text: 'abgegeben · wartet auf Bescheid', tone: null })
    expect(status(2024)).toEqual({ text: 'Bescheid · 92 € weniger als erklärt', tone: 'bad' })
    expect(status(2023)).toEqual({ text: 'Bescheid wie erklärt', tone: null })
    expect(status(2021)).toEqual({ text: 'nur Bescheid', tone: null })
    expect(plain(yearStatus({ ...item(2024), difference: 40 }, undefined, tr).text)).toBe('Bescheid · 40 € mehr als erklärt')
    expect(yearStatus({ ...item(2024), difference: 0 }, undefined, tr).text).toBe('Bescheid · 2 Änderungen')
    expect(yearStatus({ ...item(2023), noDiffReason: 'keine-eingereichte-fassung' }, undefined, tr).text).toBe('Bescheid · ohne Abgleich')
  })

  it('gives each year one amount: laut Bescheid, else the range of the estimate, else „–“', () => {
    expect(plain(yearAmount(item(2024), entry(2024)))).toBe('+809 €')
    expect(plain(yearAmount(item(2025), entry(2025)))).toBe('+1.066–1.196 €')
    expect(yearAmount(item(2026), entry(2026))).toBe('–')
    expect(plain(declaredAmount(item(2024), entry(2024)))).toBe('+901 €')
    expect(plain(declaredAmount(item(2025), entry(2025)))).toBe('+1.066–1.196 €')
    expect(declaredAmount(item(2021), entry(2021))).toBe('–')
  })

  it('says in a few words what an open year lacks, and concretely on its page', () => {
    expect(missingShort(['lohnsteuerbescheinigung'], tr)).toBe('Lohnsteuerbescheinigung fehlt')
    expect(missingShort(['einkommen', 'personB.lohnsteuerbescheinigung', 'werbungskosten', 'wechselkurs'], tr)).toBe('2 Lohnsteuerbescheinigungen fehlen, +2 weitere')
    expect(missingShort(['etwas-neues'], tr)).toBe('Angaben fehlen')
    expect(missingShort([], tr)).toBe('')
    expect(missingDetail(['lohnsteuerbescheinigung', 'personB.lohnsteuerbescheinigung'], 2026, '2026-11-18', tr)).toEqual(['die Lohnsteuerbescheinigungen 2026 (kommen ab Februar 2027)'])
    expect(missingDetail(['einkommen'], 2026, '2027-03-01', tr)).toEqual(['die Lohnsteuerbescheinigung 2026'])
    expect(missingDetail(['personB.lohnsteuerbescheinigung', 'veranlagungsart'], 2026, '2026-11-18', tr)).toEqual(['die Lohnsteuerbescheinigung 2026 von Person B (kommt ab Februar 2027)', 'die Veranlagungsart'])
    expect(missingShort(['lohnsteuerbescheinigung'], en)).toBe('wage tax certificate missing')
  })

  it('names the change of the filing type for the year it happened', () => {
    expect(filingTypeChange(HISTORY_RESPONSE, 2023)).toBe('zusammen')
    expect(filingTypeChange(HISTORY_RESPONSE, 2024)).toBeNull()
    expect(filingTypeChange(HISTORY_RESPONSE, 2021)).toBeNull()
  })
})
