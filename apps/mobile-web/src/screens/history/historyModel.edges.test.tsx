// The edges of the pure Verlauf pieces (ADR-0098/0099): the wordings that need a particular shape of
// figure, the chart columns of the odd years, the owl's sentences for the cases the example household
// does not have, and the hints of the timeline for years that are missing, filed elsewhere or cut.
import { describe, expect, it } from 'vitest'
import type { HistoryDeltaDto, HistoryFigureDto, OpenItemDto, YearHistoryEntryDto, YearListItemDto } from '@steuereule/api-client'
import { createAppI18n } from '../../i18n/app-i18n'
import { HISTORY_RESPONSE, HISTORY_YEARS, est, fig, open } from '../../../test/test-history-fixture'
import { buildAmountChart, buildChart, effectivePerson, netFor, niceTicks, sparkPoints, workFor } from './historyChartModel'
import {
  bounds,
  deltaText,
  deltaTone,
  exactValue,
  figureText,
  germanDate,
  hasValue,
  isHouseholdOnly,
  joinList,
  missingPhrases,
  missingSentence,
  newestFirst,
  percent,
  signedFigureText,
  signedPercent,
  signedPoints,
  thousands,
} from './historyFormat'
import { owlSentence } from './owlSentences'
import { declaredAmount, missingDetail, missingShort, urgentFirst, yearAmount, yearFigure, yearStatus } from './historyTimeline'
import { asksFiledElsewhere, coupleCopy, cutsOfYear, daysUntil, eventPhrase, eventsByYear, groupTabs, isLastChance, recurringLine, repeatedCutSentence, repeatedCutTitle } from './historyInsights'

const i18nT = createAppI18n('de').t
const NBSP_LIKE = /[\u00a0\u202f]/g
const tr = ((...args: unknown[]) => String((i18nT as unknown as (...a: unknown[]) => unknown)(...args)).replace(NBSP_LIKE, ' ')) as unknown as typeof i18nT
const plain = (s: string) => s.replace(NBSP_LIKE, ' ')

const entry = (year: number): YearHistoryEntryDto => HISTORY_YEARS.find((e) => e.year === year)!
const item = (year: number): YearListItemDto => HISTORY_RESPONSE.list.find((l) => l.year === year)!
const noDelta: HistoryDeltaDto = { kind: 'none', reason: 'kein-vorjahr' }

describe('historyFormat — the shapes of a figure', () => {
  it('signs a percentage, a quote change and a plain percentage with a real minus', () => {
    expect(plain(signedPercent(3.4))).toBe('+3,4 %')
    expect(plain(signedPercent(-3.4))).toBe('−3,4 %')
    expect(plain(signedPercent(0))).toBe('±0,0 %')
    expect(plain(signedPoints(1.2))).toBe('+1,2 Pp.')
    expect(plain(signedPoints(-1.2))).toBe('−1,2 Pp.')
    expect(plain(signedPoints(0))).toBe('±0,0 Pp.')
    expect(plain(percent(31.44))).toBe('31,4 %')
    expect(thousands(1234)).toBe('1,2k')
  })

  it('takes bounds from a Bescheid value, a range, a bare value and nothing', () => {
    expect(bounds(fig(100))).toEqual({ from: 100, to: 100 })
    expect(bounds(est(10, 20))).toEqual({ from: 10, to: 20 })
    expect(bounds({ tier: 'schaetzung', value: 7, source: 'schaetzung', delta: noDelta } as HistoryFigureDto)).toEqual({ from: 7, to: 7 })
    expect(bounds({ tier: 'schaetzung', source: 'schaetzung', delta: noDelta } as HistoryFigureDto)).toBeNull()
    expect(bounds(open())).toBeNull()
    expect(bounds(null)).toBeNull()
    expect(bounds(undefined)).toBeNull()
    expect(hasValue(est(1, 2))).toBe(true)
    expect(hasValue(open())).toBe(false)
    expect(exactValue(est(1, 2))).toBeNull()
    expect(exactValue(fig(5))).toBe(5)
  })

  it('writes a figure as euros or percent, exact or as a range, and the open text for an open one', () => {
    expect(plain(figureText(fig(1200), 'euro', '–'))).toBe('1.200 €')
    expect(plain(figureText(est(1066, 1196), 'euro', '–'))).toContain('1.066')
    expect(plain(figureText(est(1196, 1066), 'euro', '–'))).toContain('1.196')
    expect(plain(figureText(fig(31.4), 'percent', '–'))).toBe('31,4 %')
    expect(plain(figureText(est(30, 32), 'percent', '–'))).toBe('30,0–32,0 %')
    expect(figureText(open(), 'euro', 'offen')).toBe('offen')
  })

  it('writes a signed range once when both ends share a sign, and both ends when they differ', () => {
    expect(plain(signedFigureText(est(1066, 1196), ''))).toBe('+1.066–1.196 €')
    expect(plain(signedFigureText(est(-200, -100), ''))).toBe('−100–200 €')
    expect(plain(signedFigureText(est(-100, 300), ''))).toBe('−100 € – +300 €')
    expect(plain(signedFigureText(fig(-92), ''))).toBe('−92 €')
    expect(signedFigureText(open(), 'offen')).toBe('offen')
  })

  it('words a change: exact with its percentage, a range, a range of one value and no change', () => {
    expect(plain(deltaText({ kind: 'exact', absolute: 599, percent: 285.2 }, 'euro', tr))).toBe('+599 € (+285,2 %) zum Vorjahr')
    expect(plain(deltaText({ kind: 'exact', absolute: 1.2, percent: null }, 'percent', tr))).toBe('+1,2 Pp. zum Vorjahr')
    expect(plain(deltaText({ kind: 'range', absoluteRange: { from: 5, to: 5 } }, 'euro', tr))).toBe('+5 € zum Vorjahr')
    expect(deltaText({ kind: 'none', reason: 'veranlagungsart-gewechselt' }, 'euro', tr)).toBe(tr('verlauf.delta.keins.veranlagungsart-gewechselt'))
    expect(deltaText({ kind: 'none' } as HistoryDeltaDto, 'euro', tr)).toBe(tr('verlauf.delta.keins.kein-vorjahr'))
    expect(deltaText({ kind: 'exact' } as HistoryDeltaDto, 'euro', tr)).toBe(tr('verlauf.delta.keins.kein-vorjahr'))
  })

  it('colours a change by its direction, the other way round for a quote', () => {
    expect(deltaTone({ kind: 'exact', absolute: 5, percent: null }, false)).toBe('good')
    expect(deltaTone({ kind: 'exact', absolute: -5, percent: null }, false)).toBe('bad')
    expect(deltaTone({ kind: 'exact', absolute: 0, percent: null }, false)).toBe('neutral')
    expect(deltaTone({ kind: 'exact', absolute: -1, percent: null }, true)).toBe('good')
    expect(deltaTone({ kind: 'exact', absolute: 1, percent: null }, true)).toBe('bad')
    expect(deltaTone({ kind: 'exact', absolute: 0, percent: null }, true)).toBe('neutral')
    expect(deltaTone({ kind: 'range', absoluteRange: { from: 2, to: 9 } }, false)).toBe('good')
    expect(deltaTone({ kind: 'none', reason: 'offen' }, false)).toBe('neutral')
  })

  it('lists what is missing: nothing, one thing, several, folded and for the partner', () => {
    expect(missingSentence([], tr)).toBe(tr('verlauf.fehlt.nichtsGenannt'))
    expect(missingPhrases(['lohnsteuer', 'lohnsteuer', 'etwas-unbekanntes', 'zweites-unbekanntes'], tr)).toEqual([tr('verlauf.fehlt.lohnsteuer'), tr('verlauf.fehlt.sonstiges')])
    expect(missingPhrases(['personB.rente'], tr)).toEqual([tr('verlauf.fehlt.vonPersonB', { was: tr('verlauf.fehlt.rente') })])
    expect(missingSentence(['rente', 'wechselkurs'], tr, 'fehltNoch')).toContain(tr('verlauf.und'))
    expect(joinList([], tr)).toBe('')
    expect(joinList(['a'], tr)).toBe('a')
    expect(joinList(['a', 'b', 'c'], tr)).toBe(`a, b ${tr('verlauf.und')} c`)
  })

  it('formats a date and sorts years without touching the list', () => {
    expect(germanDate('2026-12-07T10:00:00Z')).toBe('07.12.2026')
    expect(germanDate(null)).toBe('')
    expect(germanDate('kein datum')).toBe('kein datum')
    const years = [{ year: 2022 }, { year: 2025 }, { year: 2023 }]
    expect(newestFirst(years).map((y) => y.year)).toEqual([2025, 2023, 2022])
    expect(years.map((y) => y.year)).toEqual([2022, 2025, 2023])
    expect(isHouseholdOnly('erstattung')).toBe(true)
    expect(isHouseholdOnly('netto')).toBe(false)
  })
})

describe('historyChartModel — the odd columns', () => {
  it('picks the figures of the chosen person, and the household for refund and quote', () => {
    expect(netFor(entry(2024), 'A')).toBe(entry(2024).netto.A)
    expect(netFor(entry(2024), 'B')).toBe(entry(2024).netto.B)
    expect(workFor(entry(2024), 'B')).toBe(entry(2024).werbungskosten.B)
    expect(effectivePerson('erstattung', 'A')).toBe('beide')
    expect(effectivePerson('netto', 'A')).toBe('A')
  })

  it('shows a year without Netto as a gap named by why, per person', () => {
    const model = buildChart(HISTORY_YEARS, 'netto', 'A')
    const eckjahr = model.columns.find((c) => c.year === 2021)!
    expect(eckjahr).toMatchObject({ kind: 'gap', reason: 'nichtAblesbar' })
    const openYear = model.columns.find((c) => c.year === 2026)!
    expect(openYear).toMatchObject({ kind: 'gap', reason: 'offen' })
    const stacked = model.columns.find((c) => c.year === 2024)!
    expect(stacked).toMatchObject({ kind: 'stack', estimated: false })
  })

  it('labels a Netto column with the thousands when the quote is unknown', () => {
    const base = entry(2024)
    const noQuote: YearHistoryEntryDto = { ...base, netto: { ...base.netto, A: { ...base.netto.A!, nettoQuote: open() } } }
    const column = buildChart([noQuote], 'netto', 'A').columns[0]!
    expect(column).toMatchObject({ kind: 'stack' })
    expect((column as { label: string }).label).toMatch(/k$/)
  })

  it('shows Werbungskosten of an estimated year as estimated, and a total without parts as one sum', () => {
    const model = buildChart(HISTORY_YEARS, 'werbungskosten', 'beide')
    expect(model.columns.some((c) => c.kind === 'stack' && c.estimated)).toBe(true)
    expect(model.columns.find((c) => c.year === 2021)).toMatchObject({ kind: 'stack', segments: [{ kind: 'summeLautBescheid' }] })
    expect(model.columns.find((c) => c.year === 2026)).toMatchObject({ kind: 'gap', reason: 'offen' })
  })

  it('shows the Steuerquote as a point or a range, with the marginal rate when known, and a gap otherwise', () => {
    const base = entry(2024)
    const withRange: YearHistoryEntryDto = { ...base, steuerquote: { ...base.steuerquote, effective: est(18, 21), marginal: est(30, 33) } }
    const exact: YearHistoryEntryDto = { ...base, steuerquote: { ...base.steuerquote, effective: fig(20), marginal: null } }
    const model = buildChart([withRange, exact, entry(2026), entry(2021)], 'steuerquote', 'A')
    expect(model.columns[0]).toMatchObject({ kind: 'quote', from: 18, to: 21, marginal: 33 })
    expect((model.columns[0] as { label: string }).label).toContain('–')
    expect(model.columns[1]).toMatchObject({ kind: 'quote', from: 20, to: 20, marginal: null })
    expect(model.columns[2]).toMatchObject({ kind: 'gap' })
    expect(model.max).toBeGreaterThanOrEqual(40)
  })

  it('shows a refund without a cut and a refund with one, and lists the changes of the filing type', () => {
    const model = buildChart(HISTORY_YEARS, 'erstattung', 'A')
    const bescheid = model.columns.find((c) => c.year === 2022)!
    expect(bescheid).toMatchObject({ kind: 'refund', cutLabel: null })
    expect(model.columns.find((c) => c.year === 2024)).toMatchObject({ kind: 'refund' })
    expect(model.filingTypeChanges.length).toBeGreaterThan(0)
    expect(buildChart(HISTORY_YEARS, 'netto', 'A').filingTypeChanges).toEqual([])
  })

  it('makes ticks for a single value, a negative range and a big range', () => {
    expect(niceTicks(0, 0)[0]).toBe(0)
    expect(niceTicks(-500, 500)).toContain(0)
    const big = niceTicks(0, 900_000)
    expect(big.length).toBeGreaterThan(1)
    expect(sparkPoints([{ from: 5, to: 5 }, { from: 5, to: 5 }])).toContain(',')
  })

  it('builds one amount series as signed refunds or plain bars, with gaps for missing years', () => {
    const points = [{ year: 2023, value: 100 }, { year: 2024, value: null }, { year: 2025, value: -50 }]
    const signed = buildAmountChart(points)
    expect(signed.columns.map((c) => c.kind)).toEqual(['refund', 'gap', 'refund'])
    expect(signed.min).toBeLessThan(0)
    const bars = buildAmountChart(points, 'bar')
    expect(bars.columns.map((c) => c.kind)).toEqual(['stack', 'gap', 'stack'])
    expect(buildAmountChart([]).ticks.length).toBeGreaterThan(0)
  })
})

describe('owlSentence — the cases the example household does not have', () => {
  it('says nothing yet for empty data in every metric', () => {
    for (const metric of ['erstattung', 'werbungskosten', 'netto', 'steuerquote'] as const) {
      expect(owlSentence(metric, [], [], 'beide', tr)).not.toBe('')
    }
    expect(owlSentence('netto', [entry(2026)], [], 'A', tr)).toBe(tr('verlauf.eule.netto.leer'))
    expect(owlSentence('steuerquote', [entry(2026)], [], 'beide', tr)).toBe(tr('verlauf.eule.steuerquote.leer'))
  })

  it('names a single year of Netto', () => {
    expect(owlSentence('netto', [entry(2024)], [], 'A', tr)).toContain('2024')
  })

  it('names the tax rate with and without a marginal rate', () => {
    const base = entry(2024)
    const noMarginal: YearHistoryEntryDto = { ...base, steuerquote: { ...base.steuerquote, effective: fig(20), marginal: null } }
    const withMarginal: YearHistoryEntryDto = { ...base, steuerquote: { ...base.steuerquote, effective: fig(20), marginal: fig(33.4) } }
    expect(owlSentence('steuerquote', [noMarginal], [], 'beide', tr)).toBe(tr('verlauf.eule.steuerquote.ohneGrenz', { jahr: 2024, quote: '20,0 %' }))
    expect(owlSentence('steuerquote', [withMarginal], [], 'beide', tr)).toContain('33')
  })

  it('names the largest part of the work expenses for one person and the years below the lump sum for a single', () => {
    const single = HISTORY_YEARS.map((e) => ({ ...e, persons: ['A'] as ('A' | 'B')[] }))
    const text = owlSentence('werbungskosten', single, [], 'A', tr)
    expect(text.length).toBeGreaterThan(0)
    const below = owlSentence('werbungskosten', HISTORY_YEARS, [], 'beide', tr)
    expect(below).toContain('2023')
  })

  it('says that all work expenses are above the lump sum when none is below', () => {
    const above = [entry(2025)].map((e) => ({ ...e, werbungskosten: { ...e.werbungskosten, A: { ...e.werbungskosten.A!, belowLumpSum: false } } }))
    expect(owlSentence('werbungskosten', above, [], 'A', tr)).toContain(tr('verlauf.eule.werbungskosten.ueber'))
  })

  it('reports refunds that were cut, raised or the same, the estimate and single filings', () => {
    const list = (declared: number, assessed: number, year: number): YearListItemDto => ({ ...item(2024), year, declaredRefund: declared, assessedRefund: assessed, difference: assessed - declared })
    const text = owlSentence('erstattung', HISTORY_YEARS, [list(900, 800, 2023), list(500, 650, 2022), list(300, 300, 2021)], 'beide', tr)
    expect(text).toContain(tr('verlauf.eule.erstattung.bilanz', { count: 3, gleich: 1 }))
    expect(text).toContain('100')
    expect(text).toContain('150')
    expect(text).toContain('2025')
    expect(owlSentence('erstattung', [], [], 'beide', tr)).toBe(tr('verlauf.eule.erstattung.leer'))
  })

  it('counts the years that were filed as single returns', () => {
    const single = [{ ...entry(2022), erstattung: { ...entry(2022).erstattung, sumOfSingleFilings: true } }]
    expect(owlSentence('erstattung', single, [], 'beide', tr)).toContain('2022')
  })
})

describe('historyTimeline — years and their hints', () => {
  it('words an open year by what it lacks, with and without a reason', () => {
    expect(yearStatus({ ...item(2026), hasData: true, kind: 'offen' }, entry(2026), tr)).toMatchObject({ tone: null })
    expect(yearStatus({ ...item(2026), hasData: true, kind: 'offen' }, { ...entry(2026), missing: [] }, tr).text).toBe(tr('verlauf.zeile.offen'))
    expect(yearStatus({ ...item(2026), hasData: true, kind: 'offen' }, undefined, tr).text).toBe(tr('verlauf.zeile.offen'))
  })

  it('words a Bescheid that raised the refund, one with changes only in positions, and one without a comparison', () => {
    const base: YearListItemDto = { ...item(2024), kind: 'bescheid', hasData: true, withoutAssessment: false, deadline: { ...item(2024).deadline, kind: 'einspruch', running: false } as never }
    expect(yearStatus({ ...base, difference: 40, deviations: 0 }, entry(2024), tr)).toEqual({ text: tr('verlauf.zeile.mehr', { betrag: '40 €' }), tone: null })
    expect(yearStatus({ ...base, difference: 0, deviations: 2 }, entry(2024), tr).text).toBe(tr('verlauf.zeile.aenderungen', { count: 2 }))
    expect(yearStatus({ ...base, difference: 0, deviations: 0, noDiffReason: null }, entry(2024), tr).text).toBe(tr('verlauf.zeile.wieErklaert'))
    expect(yearStatus({ ...base, difference: null, deviations: 0, noDiffReason: 'kein-abgleich' as never }, entry(2024), tr).text).toBe(tr('verlauf.zeile.ohneAbgleich'))
  })

  it('adds the day until which an assessed year can still be changed, unless the Bescheid cut something', () => {
    const base: YearListItemDto = { ...item(2024), kind: 'eckjahr', hasData: true, withoutAssessment: false, difference: null, deviations: 0, deadline: { kind: 'aenderbar-bis', running: true, endsOn: '2028-12-31', remainingDays: 800 } as never }
    expect(yearStatus(base, entry(2021), tr).text).toContain('31.12.2028')
    expect(yearStatus({ ...base, deadline: { ...base.deadline, running: false } }, entry(2021), tr).text).toBe(tr('verlauf.zeile.nurBescheid'))
  })

  it('words a filed year and a year without data by the answer to „Schon abgegeben?“', () => {
    expect(yearStatus({ ...item(2025), kind: 'eingereicht', hasData: true }, entry(2025), tr).text).toBe(tr('verlauf.zeile.eingereicht'))
    const gap: YearListItemDto = { ...item(2024), hasData: false, withoutAssessment: false }
    expect(yearStatus({ ...gap, filedElsewhere: { ask: true, answer: null } as never }, undefined, tr).text).toBe(tr('verlauf.zeile.frage'))
    expect(yearStatus({ ...gap, filedElsewhere: { ask: false, answer: 'ja' } as never }, undefined, tr).text).toBe(tr('verlauf.zeile.anderswo'))
    expect(yearStatus({ ...gap, filedElsewhere: { ask: false, answer: 'nein' } as never }, undefined, tr).text).toContain(tr('verlauf.zeile.nichtAbgegeben', { datum: germanDate(gap.deadline.endsOn) }).slice(0, 8))
    expect(yearStatus({ ...gap, filedElsewhere: null }, undefined, tr).text).toBe(tr('verlauf.zeile.nichtInApp', { datum: germanDate(gap.deadline.endsOn) }))
    expect(yearStatus({ ...item(2024), withoutAssessment: true }, undefined, tr).text).toBe(tr('verlauf.zeile.anderswo'))
  })

  it('gives amounts of a filed year from its estimate and of a Bescheid year from the Bescheid', () => {
    expect(yearAmount({ ...item(2024), hasData: false }, entry(2024))).toBe('–')
    expect(yearAmount({ ...item(2025), assessedRefund: null, hasData: true }, undefined)).toBe('–')
    expect(plain(yearAmount({ ...item(2025), assessedRefund: null, hasData: true }, entry(2025)))).toContain('1.066')
    expect(plain(yearAmount({ ...item(2024), assessedRefund: -92, hasData: true }, entry(2024)))).toBe('−92 €')
    expect(declaredAmount({ ...item(2024), hasData: false }, entry(2024))).toBe('–')
    expect(plain(declaredAmount({ ...item(2025), kind: 'eingereicht', hasData: true }, entry(2025)))).toContain('1.066')
    expect(declaredAmount({ ...item(2024), kind: 'bescheid', hasData: true, declaredRefund: null }, entry(2024))).toBe('–')
    expect(plain(declaredAmount({ ...item(2024), kind: 'bescheid', hasData: true, declaredRefund: 900 }, entry(2024)))).toBe('+900 €')
  })

  it('gives the year page a figure only where nothing else shows it', () => {
    expect(yearFigure({ ...item(2024), hasData: false }, entry(2024), false, tr)).toBeNull()
    expect(yearFigure({ ...item(2024), hasData: true }, entry(2024), true, tr)).toBeNull()
    expect(yearFigure({ ...item(2024), hasData: true, assessedRefund: -300 }, entry(2024), false, tr)).toBe(tr('verlauf.jahr.betrag.nachzahlung', { betrag: '300 €' }))
    expect(yearFigure({ ...item(2024), hasData: true, assessedRefund: 300 }, entry(2024), false, tr)).toBe(tr('verlauf.jahr.betrag.erstattung', { betrag: '300 €' }))
    expect(yearFigure({ ...item(2026), hasData: true, kind: 'offen', assessedRefund: null }, entry(2026), false, tr)).toBeNull()
    expect(yearFigure({ ...item(2025), hasData: true, kind: 'eingereicht', assessedRefund: null }, undefined, false, tr)).toBeNull()
    expect(yearFigure({ ...item(2025), hasData: true, kind: 'eingereicht', assessedRefund: null }, { ...entry(2025), erstattung: { ...entry(2025).erstattung, amount: open() } }, false, tr)).toBeNull()
  })

  it('names what is missing in a few words and in detail', () => {
    expect(missingShort([], tr)).toBe('')
    expect(missingShort(['lohnsteuerbescheinigung'], tr)).toBe(tr('verlauf.fehltKurz.lohnsteuerbescheinigung', { count: 1 }))
    expect(missingShort(['lohnsteuer', 'personB.lohnsteuer'], tr)).toBe(tr('verlauf.fehltKurz.lohnsteuerbescheinigung', { count: 2 }))
    expect(missingShort(['werbungskosten', 'was-anderes'], tr)).toBe(tr('verlauf.fehltKurz.mehr', { erstes: tr('verlauf.fehltKurz.werbungskosten'), count: 1 }))
    expect(missingDetail(['lohnsteuerbescheinigung'], 2026, '2026-11-18', tr)).toEqual([tr('verlauf.jahr.lstb.eineKommt', { jahr: 2026, folgejahr: 2027 })])
    expect(missingDetail(['lohnsteuerbescheinigung'], 2024, '2026-11-18', tr)).toEqual([tr('verlauf.jahr.lstb.eine', { jahr: 2024, folgejahr: 2025 })])
    expect(missingDetail(['personB.lohnsteuerbescheinigung'], 2026, '2026-11-18', tr)[0]).toBe(tr('verlauf.jahr.lstb.personBKommt', { jahr: 2026, folgejahr: 2027 }))
    expect(missingDetail(['lohnsteuerbescheinigung', 'personB.lohnsteuerbescheinigung', 'rente'], 2026, '2026-11-18', tr)).toHaveLength(2)
  })

  it('orders deadlines by their days, then the highlighted item, then the kind', () => {
    const base: OpenItemDto = { year: 2024, kind: 'offen', highlighted: false, deadline: null, filingDeadline: null } as unknown as OpenItemDto
    const items: OpenItemDto[] = [
      { ...base, year: 2023, kind: 'offen' },
      { ...base, year: 2024, kind: 'wartet-auf-bescheid' },
      { ...base, year: 2022, kind: 'einspruchsfrist', deadline: { running: true, remainingDays: 9 } as never },
      { ...base, year: 2021, kind: 'offen', filingDeadline: '2026-12-31' },
      { ...base, year: 2020, kind: 'offen', highlighted: true },
    ]
    expect(urgentFirst(items, '2026-11-18').map((i) => i.year)).toEqual([2022, 2021, 2020, 2024, 2023])
    expect(urgentFirst(items).map((i) => i.year)[0]).toBe(2022)
  })
})

describe('historyInsights — the hints in words', () => {
  it('knows when a year asks „Schon abgegeben?“ and when it is the last chance', () => {
    expect(asksFiledElsewhere({ ...item(2024), hasData: false, filedElsewhere: { ask: true, answer: null } as never })).toBe(true)
    expect(asksFiledElsewhere({ ...item(2024), hasData: true, filedElsewhere: { ask: true, answer: null } as never })).toBe(false)
    expect(daysUntil('2026-11-18', '2026-12-31T00:00:00Z')).toBe(43)
    expect(isLastChance({ kind: 'offen', filingDeadline: '2026-12-31' } as OpenItemDto, '2026-11-18')).toBe(true)
    expect(isLastChance({ kind: 'offen', filingDeadline: '2027-12-31' } as OpenItemDto, '2026-11-18')).toBe(false)
    expect(isLastChance({ kind: 'offen', filingDeadline: null } as OpenItemDto, '2026-11-18')).toBe(false)
  })

  it('words life events once per year and with the number of children', () => {
    expect(eventPhrase([{ year: 2025, kind: 'kind', count: 2, person: null }, { year: 2025, kind: 'kind', count: 2, person: null }], tr)).toBe(tr('verlauf.ereignis.kind', { count: 2 }))
    expect(eventPhrase([{ year: 2025, kind: 'kind', person: null } as never], tr)).toBe(tr('verlauf.ereignis.kind', { count: 1 }))
    const events = eventsByYear([{ year: 2025, kind: 'kind', count: 1, person: null }, { year: 2023, kind: 'heirat', person: null } as never], tr)
    expect([...events.keys()].sort()).toEqual([2023, 2025])
  })

  it('words what comes back every year: amounts, kilometres, days, the receipt and the cuts', () => {
    const base = { label: 'x', lastYear: 2025, lastAmount: 1200, currentAmount: null, lastDetail: null, currentDetail: null, receipt: 'keiner', cutInYears: [] } as never
    expect(recurringLine({ ...(base as object), receipt: 'uebernommen', cutInYears: [2023, 2024] } as never, 2026, tr)).toContain(tr('verlauf.wiederkehrend.uebernommen'))
    expect(recurringLine({ ...(base as object), receipt: 'vorschlag' } as never, 2026, tr)).toContain(tr('verlauf.wiederkehrend.vorschlag'))
    const detailed = recurringLine({ ...(base as object), lastAmount: null, lastDetail: { km: 20, days: 130 }, currentAmount: 900 } as never, 2026, tr)
    expect(detailed).toContain('20')
    expect(detailed).toContain('900')
    expect(recurringLine({ ...(base as object), lastAmount: null, currentAmount: null } as never, 2026, tr)).toBe('')
  })

  it('names repeated cuts by how often, with one amount or with each', () => {
    const cut = (...diffs: Array<[number, number]>) => ({ position: 'homeoffice', years: diffs.map(([year, difference]) => ({ year, difference })) }) as never
    expect(repeatedCutTitle(cut([2023, -180], [2024, -180]), tr)).toBe(tr('verlauf.muster.mal_2'))
    expect(repeatedCutTitle(cut([2022, -1], [2023, -1], [2024, -1]), tr)).toBe(tr('verlauf.muster.mal_3'))
    expect(repeatedCutTitle(cut([2021, -1], [2022, -1], [2023, -1], [2024, -1]), tr)).toBe(tr('verlauf.muster.mal_n', { count: 4 }))
    expect(repeatedCutSentence(cut([2023, -180], [2024, -180]), 'Homeoffice', tr)).toContain('180')
    expect(repeatedCutSentence(cut([2023, -180], [2024, -90]), 'Homeoffice', tr)).toContain('90')
    const cuts = [cut([2022, -1], [2023, -1], [2024, -1]), cut([2020, -1], [2021, -1])]
    expect(cutsOfYear(cuts, 2023).map((c) => (c as { years: unknown[] }).years.length)).toEqual([2])
    expect(cutsOfYear(cuts, 2024)).toHaveLength(1)
  })

  it('words the couple comparison for every status and direction', () => {
    const base = { year: 2024, status: 'bestimmt', filedAs: 'zusammen', jointSaving: 500, approximate: false, jointSavingRange: null, statement: 'klar', missing: [] } as never
    const c = (over: object) => coupleCopy({ ...(base as object), ...over } as never, tr)
    expect(c({ status: 'tarif-fehlt' }).text).toBe(tr('verlauf.paare.tarifFehlt', { jahr: 2024 }))
    expect(c({ status: 'unvollstaendig', missing: ['rente'] }).text).toContain(tr('verlauf.fehlt.rente'))
    expect(c({ jointSaving: 0 }).text).toBe(tr('verlauf.paare.gleich', { jahr: 2024 }))
    expect(c({ filedAs: 'einzel', jointSaving: 500 }).text).toBe(tr('verlauf.paare.zusammenMehr', { jahr: 2024, betrag: '500 €' }))
    expect(c({ filedAs: 'einzel', jointSaving: -500 }).text).toBe(tr('verlauf.paare.einzelnGebracht', { jahr: 2024, betrag: '500 €' }))
    expect(c({ jointSaving: 500 }).text).toBe(tr('verlauf.paare.zusammenGebracht', { jahr: 2024, betrag: '500 €' }))
    expect(c({ jointSaving: -500 }).text).toBe(tr('verlauf.paare.einzelnMehr', { jahr: 2024, betrag: '500 €' }))
    expect(c({ statement: 'zu-knapp' }).note).toBe(tr('verlauf.paare.knapp'))
    expect(c({ statement: 'unbestimmt' }).note).toBe(tr('verlauf.paare.knapp'))
    expect(c({}).note).toBeNull()
    const ranged = c({ approximate: true, jointSaving: 500, jointSavingRange: { from: 400, to: 600 } })
    expect(ranged.approximate).toBe(tr('verlauf.paare.etwaSpanne'))
    expect(ranged.text).toBe(tr('verlauf.paare.zusammenGebracht', { jahr: 2024, betrag: tr('verlauf.paare.etwaBetrag', { von: '400 €', bis: '600 €' }) }))
    expect(c({ approximate: true, jointSaving: 500, jointSavingRange: { from: -100, to: 600 } }).approximate).toBe(tr('verlauf.paare.etwa'))
    expect(c({ approximate: true, jointSaving: 500, jointSavingRange: { from: 500, to: 500 } }).approximate).toBe(tr('verlauf.paare.etwa'))
    expect(c({ approximate: true, jointSaving: 500, jointSavingRange: null }).approximate).toBe(tr('verlauf.paare.etwa'))
  })

  it('offers a tab only for a group the household has data for', () => {
    const none = { prepayments: { backPaymentYears: 0 }, groups: { crossBorder: null, rental: null, capital: null, pension: null } } as never
    expect(groupTabs(none)).toEqual([])
    const all = { prepayments: { backPaymentYears: 2 }, groups: { crossBorder: { years: [1] }, rental: { properties: [1] }, capital: { years: [1] }, pension: { years: [1] } } } as never
    expect(groupTabs(all)).toEqual(['vorauszahlungen', 'schweiz', 'vermietung', 'kapital', 'rente'])
  })
})
