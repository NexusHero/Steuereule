import type { NetFiguresDto, WorkExpenseFiguresDto, YearHistoryEntryDto } from '@steuereule/api-client'
import { bounds, exactValue, isHouseholdOnly, percent, signedEuro, thousands, type HistoryMetric, type HistoryPerson } from './historyFormat'

/** One coloured part of a stacked bar. */
export type SegmentKind = 'netto' | 'steuern' | 'sozialversicherung' | 'fahrtweg' | 'homeoffice' | 'arbeitsmittel' | 'sonstiges' | 'summeLautBescheid'

export type ChartColumn =
  /** `offen`: too few facts; `nichtAblesbar`: the Bescheid (an Eckjahr) does not say. */
  | { readonly year: number; readonly kind: 'gap'; readonly reason: 'offen' | 'nichtAblesbar' }
  | {
      readonly year: number
      readonly kind: 'stack'
      /** Tier `schaetzung`: dashed outline. */
      readonly estimated: boolean
      readonly segments: readonly { readonly kind: SegmentKind; readonly value: number }[]
      readonly label: string
      /** The Arbeitnehmer-Pauschbetrag line of the year (Werbungskosten). */
      readonly line: number | null
    }
  /** Tier `schaetzung` of the refund: a hatched band, labelled as a range. */
  | { readonly year: number; readonly kind: 'range'; readonly from: number; readonly to: number; readonly label: string }
  | {
      readonly year: number
      readonly kind: 'refund'
      readonly value: number
      /** What was declared in the app: the mark at the bar; the area between it and the bar is the cut. */
      readonly declared: number | null
      readonly label: string
      readonly cutLabel: string | null
    }
  | {
      readonly year: number
      readonly kind: 'quote'
      readonly from: number
      readonly to: number
      readonly marginal: number | null
      readonly label: string
    }

export interface ChartModel {
  readonly metric: HistoryMetric
  readonly min: number
  readonly max: number
  readonly ticks: readonly number[]
  readonly unit: 'euro' | 'percent'
  readonly columns: readonly ChartColumn[]
  /** Years whose Veranlagungsart differs from the year before (marked as a dashed line). */
  readonly filingTypeChanges: readonly { readonly year: number; readonly filingType: 'einzel' | 'zusammen' }[]
}

/** The person the metric is shown for: Erstattung and Steuerquote are always the household. */
export function effectivePerson(metric: HistoryMetric, person: HistoryPerson): HistoryPerson {
  return isHouseholdOnly(metric) ? 'beide' : person
}

export function netFor(entry: YearHistoryEntryDto, person: HistoryPerson): NetFiguresDto | null {
  if (person === 'beide') return entry.netto.beide
  if (person === 'A') return entry.netto.A
  return entry.netto.B
}

export function workFor(entry: YearHistoryEntryDto, person: HistoryPerson): WorkExpenseFiguresDto | null {
  if (person === 'beide') return entry.werbungskosten.beide
  if (person === 'A') return entry.werbungskosten.A
  return entry.werbungskosten.B
}

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]

/** Round axis ticks from `lo` to `hi` (both included), at most about five lines. */
export function niceTicks(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1)
  const step = STEPS.find((s) => span / s <= 4.6) ?? span / 4
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

function netColumn(entry: YearHistoryEntryDto, person: HistoryPerson): ChartColumn {
  const net = netFor(entry, person)
  const brutto = exactValue(net?.brutto)
  const netto = exactValue(net?.netto)
  if (net === null || brutto === null || netto === null) {
    return { year: entry.year, kind: 'gap', reason: entry.eckjahr ? 'nichtAblesbar' : 'offen' }
  }
  const taxes = (exactValue(net.lohnsteuer) ?? 0) + (exactValue(net.solidaritaetszuschlag) ?? 0) + (exactValue(net.kirchensteuer) ?? 0)
  const social = exactValue(net.sozialversicherung) ?? 0
  const quote = exactValue(net.nettoQuote)
  return {
    year: entry.year,
    kind: 'stack',
    estimated: false,
    segments: [
      { kind: 'netto', value: netto },
      { kind: 'steuern', value: taxes },
      { kind: 'sozialversicherung', value: social },
    ],
    label: quote === null ? thousands(netto) : percent(quote),
    line: null,
  }
}

function workColumn(entry: YearHistoryEntryDto, person: HistoryPerson): ChartColumn {
  const work = workFor(entry, person)
  const total = bounds(work?.total)
  if (work === null || total === null) return { year: entry.year, kind: 'gap', reason: 'offen' }
  const estimated = work.total.tier === 'schaetzung'
  const segments: { kind: SegmentKind; value: number }[] = work.parts
    ? [
        { kind: 'fahrtweg', value: work.parts.fahrtweg },
        { kind: 'homeoffice', value: work.parts.homeoffice },
        { kind: 'arbeitsmittel', value: work.parts.arbeitsmittel },
        { kind: 'sonstiges', value: work.parts.sonstiges },
      ]
    : [{ kind: 'summeLautBescheid', value: total.to }]
  const sum = segments.reduce((a, s) => a + s.value, 0)
  return { year: entry.year, kind: 'stack', estimated, segments, label: thousands(sum), line: work.pauschbetrag }
}

function refundColumn(entry: YearHistoryEntryDto): ChartColumn {
  const amount = entry.erstattung.amount
  const value = exactValue(amount)
  if (value !== null) {
    const declared = entry.erstattung.declared
    const difference = entry.erstattung.difference
    return {
      year: entry.year,
      kind: 'refund',
      value,
      declared,
      label: `${entry.erstattung.sumOfSingleFilings ? 'Σ ' : ''}${signedEuro(value)}`,
      cutLabel: difference !== null && difference !== 0 ? signedEuro(difference) : null,
    }
  }
  const range = bounds(amount)
  if (range !== null) return { year: entry.year, kind: 'range', from: range.from, to: range.to, label: `${thousands(range.from)}–${thousands(range.to)}` }
  return { year: entry.year, kind: 'gap', reason: 'offen' }
}

function quoteColumn(entry: YearHistoryEntryDto): ChartColumn {
  const effective = bounds(entry.steuerquote.effective)
  if (effective === null) return { year: entry.year, kind: 'gap', reason: entry.eckjahr ? 'nichtAblesbar' : 'offen' }
  const marginal = exactValue(entry.steuerquote.marginal) ?? bounds(entry.steuerquote.marginal)?.to ?? null
  const label = effective.from === effective.to ? percent(effective.from) : `${effective.from.toLocaleString('de-DE', { maximumFractionDigits: 1 })}–${percent(effective.to)}`
  return { year: entry.year, kind: 'quote', from: effective.from, to: effective.to, marginal, label }
}

function columnFor(entry: YearHistoryEntryDto, metric: HistoryMetric, person: HistoryPerson): ChartColumn {
  switch (metric) {
    case 'netto':
      return netColumn(entry, person)
    case 'werbungskosten':
      return workColumn(entry, person)
    case 'erstattung':
      return refundColumn(entry)
    case 'steuerquote':
      return quoteColumn(entry)
  }
}

/** The values a column spans, for the axis. */
function extentOf(column: ChartColumn): number[] {
  switch (column.kind) {
    case 'gap':
      return []
    case 'stack':
      return [0, column.segments.reduce((a, s) => a + s.value, 0), ...(column.line === null ? [] : [column.line])]
    case 'range':
      return [0, column.from, column.to]
    case 'refund':
      return [0, column.value, ...(column.declared === null ? [] : [column.declared])]
    case 'quote':
      return [0, column.to, ...(column.marginal === null ? [] : [column.marginal])]
  }
}

/** The chart of one key figure over the years (mock `chart()`): one column per year, oldest first. */
export function buildChart(entries: readonly YearHistoryEntryDto[], metric: HistoryMetric, person: HistoryPerson): ChartModel {
  const who = effectivePerson(metric, person)
  const columns = entries.map((e) => columnFor(e, metric, who))
  const values = columns.flatMap(extentOf)
  const unit = metric === 'steuerquote' ? 'percent' : 'euro'
  let ticks: number[]
  if (metric === 'steuerquote') {
    const top = Math.max(40, ...values)
    ticks = niceTicks(0, top)
  } else {
    const lo = Math.min(0, ...values)
    const hi = Math.max(1, ...values) * 1.12
    ticks = niceTicks(lo, hi)
  }
  return {
    metric,
    unit,
    min: ticks[0] ?? 0,
    max: ticks[ticks.length - 1] ?? 1,
    ticks,
    columns,
    filingTypeChanges: who === 'beide' ? entries.filter((e) => e.filingTypeChanged).map((e) => ({ year: e.year, filingType: e.filingType })) : [],
  }
}

/** The points of a mini trend (KPI tile): exact values, ranges by their bounds' middle only for the line's shape; open years skipped. */
export function sparkPoints(values: readonly ({ readonly from: number; readonly to: number } | null)[]): string {
  const pts = values.map((v, i) => (v === null ? null : ([i, (v.from + v.to) / 2] as const))).filter((p): p is readonly [number, number] => p !== null)
  if (pts.length < 2) return ''
  const lo = Math.min(...pts.map((p) => p[1]))
  const hi = Math.max(...pts.map((p) => p[1]))
  const n = Math.max(values.length - 1, 1)
  return pts.map(([i, v]) => `${(4 + (i / n) * 92).toFixed(1)},${(19 - (hi === lo ? 0.5 : (v - lo) / (hi - lo)) * 16).toFixed(1)}`).join(' ')
}

/**
 * One series of amounts per year for the group tabs of „Entwicklung“ (ADR-0099 §3, §7): signed amounts as
 * refund bars (green above the line, red below), positive ones as a single bar; a year without a value is a gap.
 */
export function buildAmountChart(points: readonly { readonly year: number; readonly value: number | null }[], style: 'signed' | 'bar' = 'signed'): ChartModel {
  const columns: ChartColumn[] = points.map(({ year, value }) => {
    if (value === null) return { year, kind: 'gap', reason: 'offen' }
    if (style === 'bar') return { year, kind: 'stack', estimated: false, segments: [{ kind: 'steuern', value }], label: thousands(value), line: null }
    return { year, kind: 'refund', value, declared: null, label: signedEuro(value), cutLabel: null }
  })
  const values = columns.flatMap(extentOf)
  const ticks = niceTicks(Math.min(0, ...values) * 1.12, Math.max(1, ...values) * 1.12)
  return { metric: 'erstattung', unit: 'euro', min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 1, ticks, columns, filingTypeChanges: [] }
}
