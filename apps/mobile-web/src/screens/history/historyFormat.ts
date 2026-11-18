import type { TFunction } from 'i18next'
import type { HistoryDeltaDto, HistoryFigureDto } from '@steuereule/api-client'
import { formatEuro, formatEuroRange, toGermanDate } from '@steuereule/core'

/** „Wir beide · Person A · Person B“ (ADR-0098 §6). */
export type HistoryPerson = 'beide' | 'A' | 'B'

/** The four key figures of version 1 (ADR-0098 §2), in the order of the chips. */
export type HistoryMetric = 'erstattung' | 'werbungskosten' | 'netto' | 'steuerquote'

export const METRIC_ORDER: readonly HistoryMetric[] = ['erstattung', 'werbungskosten', 'netto', 'steuerquote']

/** Erstattung and Steuerquote exist only for the household (ADR-0098 §6). */
export function isHouseholdOnly(metric: HistoryMetric): boolean {
  return metric === 'erstattung' || metric === 'steuerquote'
}

const MINUS = '−'
const NBSP = ' '

/** `+809 €`, `−92 €`, `±0 €`. */
export function signedEuro(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '±'
  return `${sign}${formatEuro(Math.abs(Math.round(n)))}`
}

/** `31,4 %` with one decimal, as the mock and the core round. */
export function percent(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}%`
}

/** `+1,2 Pp.` for a change of a quote. */
export function signedPoints(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '±'
  return `${sign}${Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${NBSP}Pp.`
}

/** `+3,4 %` for a relative change. */
export function signedPercent(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '±'
  return `${sign}${percent(Math.abs(n))}`
}

/** `1,2k` for a chart label. */
export function thousands(n: number): string {
  return `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k`
}

export type FigureUnit = 'euro' | 'percent'

/** The figure's value as a single number, or null where it is a range or open. Never a midpoint. */
export function exactValue(figure: HistoryFigureDto | null | undefined): number | null {
  return figure?.tier === 'bescheid' && typeof figure.value === 'number' ? figure.value : null
}

/** The figure's lower and upper bound: a range, or the exact value twice; null when open. */
export function bounds(figure: HistoryFigureDto | null | undefined): { readonly from: number; readonly to: number } | null {
  if (!figure || figure.tier === 'offen') return null
  if (figure.tier === 'bescheid' && typeof figure.value === 'number') return { from: figure.value, to: figure.value }
  if (figure.range) return { from: figure.range.from, to: figure.range.to }
  if (typeof figure.value === 'number') return { from: figure.value, to: figure.value }
  return null
}

/** Whether the figure has a value to show (exact or a range). */
export function hasValue(figure: HistoryFigureDto | null | undefined): boolean {
  return bounds(figure) !== null
}

/** A range from the API is shown as a range, never as its middle (ADR-0098 §3). */
export function figureText(figure: HistoryFigureDto | null | undefined, unit: FigureUnit, openText: string): string {
  const b = bounds(figure)
  if (b === null) return openText
  if (unit === 'percent') return b.from === b.to ? percent(b.from) : `${b.from.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}–${percent(b.to)}`
  return b.from === b.to ? formatEuro(Math.round(b.from)) : formatEuroRange(Math.round(Math.min(b.from, b.to)), Math.round(Math.max(b.from, b.to)))
}

/** A refund is signed: `+809 €`, a range `+1.066 – +1.196 €`. */
export function signedFigureText(figure: HistoryFigureDto | null | undefined, openText: string): string {
  const b = bounds(figure)
  if (b === null) return openText
  return b.from === b.to ? signedEuro(b.from) : `${signedEuro(b.from)} – ${signedEuro(b.to)}`
}

export type Tone = 'good' | 'bad' | 'neutral'

/**
 * The change to the previous year (ADR-0098 §2/§3): exact, a range between two ranges, or the reason
 * why there is none. Colour it with `deltaTone`.
 */
export function deltaText(delta: HistoryDeltaDto, unit: FigureUnit, tr: TFunction): string {
  const fmt = unit === 'percent' ? signedPoints : signedEuro
  if (delta.kind === 'exact' && typeof delta.absolute === 'number') {
    const pct = unit === 'euro' && typeof delta.percent === 'number' ? ` (${signedPercent(delta.percent)})` : ''
    return tr('verlauf.delta.zumVorjahr', { wert: `${fmt(delta.absolute)}${pct}` })
  }
  if (delta.kind === 'range' && delta.absoluteRange) {
    const { from, to } = delta.absoluteRange
    const text = Math.abs(from - to) < 1e-9 ? fmt(from) : tr('verlauf.delta.spanneWerte', { von: fmt(from), bis: fmt(to) })
    return tr('verlauf.delta.zumVorjahr', { wert: text })
  }
  return tr(`verlauf.delta.keins.${delta.reason ?? 'kein-vorjahr'}`)
}

/** Tone of a change: good when it goes up (refund, netto), or down where `lowerIsBetter` (tax rate). */
export function deltaTone(delta: HistoryDeltaDto, lowerIsBetter: boolean): Tone {
  const lo = delta.kind === 'exact' ? delta.absolute : delta.kind === 'range' ? delta.absoluteRange?.from : undefined
  const hi = delta.kind === 'exact' ? delta.absolute : delta.kind === 'range' ? delta.absoluteRange?.to : undefined
  if (typeof lo !== 'number' || typeof hi !== 'number') return 'neutral'
  if (lowerIsBetter) return hi < 0 ? 'good' : lo > 0 ? 'bad' : 'neutral'
  return lo > 0 ? 'good' : hi < 0 ? 'bad' : 'neutral'
}

/** The ids the API names for what a year lacks, with a German phrase each; others fall back to „weitere Angaben“. */
const KNOWN_MISSING = new Set([
  'lohnsteuerbescheinigung',
  'bruttoarbeitslohn',
  'lohnsteuer',
  'solidaritaetszuschlag',
  'kirchensteuer',
  'sozialversicherung',
  'einkommen',
  'erklaerung',
  'schaetzung',
  'werbungskosten',
  'rente',
  'veranlagungsart',
  'wechselkurs',
  'bruttolohn-total',
  'pk-obligatorium',
  'lohnersatz-betrag',
  'jahr-ohne-tarif',
  'nur-angestellte',
  'verheiratet',
  'besondere-lebenslage',
  'kein-grenzgaenger',
])

/** One phrase per missing id (`personB.` names the partner), duplicates and unknown ids folded together. */
export function missingPhrases(ids: readonly string[], tr: TFunction): string[] {
  const out: string[] = []
  for (const raw of ids) {
    const forB = raw.startsWith('personB.')
    const id = forB ? raw.slice('personB.'.length) : raw
    const phrase = KNOWN_MISSING.has(id) ? tr(`verlauf.fehlt.${id}`) : tr('verlauf.fehlt.sonstiges')
    const text = forB ? tr('verlauf.fehlt.vonPersonB', { was: phrase }) : phrase
    if (!out.includes(text)) out.push(text)
  }
  return out
}

/** „Noch offen: die Lohnsteuerbescheinigung und der Wechselkurs.“ */
export function missingSentence(ids: readonly string[], tr: TFunction): string {
  const phrases = missingPhrases(ids, tr)
  if (phrases.length === 0) return tr('verlauf.fehlt.nichtsGenannt')
  return tr('verlauf.fehlt.satz', { liste: joinList(phrases, tr) })
}

export function joinList(items: readonly string[], tr: TFunction): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${tr('verlauf.und')} ${items[items.length - 1]}`
}

/** `07.12.2026` from an ISO date, or the text as it came. */
export function germanDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return toGermanDate(iso.slice(0, 10)) ?? iso
}

/** Years newest first, without touching the list it came from. */
export function newestFirst<T extends { readonly year: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.year - a.year)
}
