import type { TFunction } from 'i18next'
import type {
  CoupleComparisonDto,
  LifeEventDto,
  OpenItemDto,
  RecurringDetailDto,
  RecurringItemDto,
  RepeatedCutDto,
  YearHistoryResponseDto,
  YearListItemDto,
} from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { germanDate, joinList, missingPhrases } from './historyFormat'

/**
 * The hints of ADR-0099 in words, pure so the copy is tested without a screen: gap years and „Schon
 * abgegeben?“ (§1), what comes back every year (§2), life events (§4), repeated cuts (§5), couples (§6).
 */

/** A year of the Festsetzungsfrist without data asks „Schon abgegeben?“ right now (ADR-0099 §1). */
export function asksFiledElsewhere(item: YearListItemDto): boolean {
  return !item.hasData && item.filedElsewhere?.ask === true
}

/** Whole days from `today` to `iso` (both `yyyy-mm-dd`). */
export function daysUntil(today: string, iso: string): number {
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}

/** The last chance to file a year: its deadline ends in the current calendar year. */
export function isLastChance(item: OpenItemDto, today: string): boolean {
  return item.kind === 'offen' && typeof item.filingDeadline === 'string' && item.filingDeadline.slice(0, 4) === today.slice(0, 4)
}

/** The life events of one year as one short phrase: „Kind geboren, neuer Arbeitgeber“. */
export function eventPhrase(events: readonly LifeEventDto[], tr: TFunction): string {
  const parts: string[] = []
  for (const e of events) {
    const text = e.kind === 'kind' ? tr('verlauf.ereignis.kind', { count: e.count ?? 1 }) : tr(`verlauf.ereignis.${e.kind}`)
    if (!parts.includes(text)) parts.push(text)
  }
  return parts.join(', ')
}

/** The life events by year, each year's events in one phrase (ADR-0099 §4: only derived from data). */
export function eventsByYear(events: readonly LifeEventDto[], tr: TFunction): Map<number, string> {
  const out = new Map<number, string>()
  for (const year of new Set(events.map((e) => e.year))) {
    const phrase = eventPhrase(
      events.filter((e) => e.year === year),
      tr,
    )
    if (phrase !== '') out.set(year, phrase)
  }
  return out
}

function detailText(detail: RecurringDetailDto | null, amount: number | null, tr: TFunction): string | null {
  const parts: string[] = []
  if (detail?.km != null) parts.push(tr('verlauf.wiederkehrend.km', { km: detail.km.toLocaleString('de-DE') }))
  if (detail?.days != null) parts.push(tr('verlauf.wiederkehrend.tage', { count: detail.days }))
  if (parts.length > 0) return parts.join(', ')
  return amount === null ? null : formatEuro(amount)
}

/** One line of „Kommt jedes Jahr wieder“: last year's amount as a hint, what this year has, the receipt, the cuts. */
export function recurringLine(item: RecurringItemDto, year: number, tr: TFunction): string {
  const parts: string[] = []
  const last = detailText(item.lastDetail, item.lastAmount, tr)
  if (last !== null) parts.push(tr('verlauf.wiederkehrend.vorjahr', { jahr: item.lastYear, was: last }))
  const current = detailText(item.currentDetail, item.currentAmount, tr)
  if (current !== null) parts.push(tr('verlauf.wiederkehrend.eingetragen', { jahr: year, was: current }))
  if (item.receipt === 'uebernommen') parts.push(tr('verlauf.wiederkehrend.uebernommen'))
  if (item.receipt === 'vorschlag') parts.push(tr('verlauf.wiederkehrend.vorschlag'))
  if (item.cutInYears.length > 0) parts.push(tr('verlauf.wiederkehrend.gekuerzt', { jahre: joinList(item.cutInYears.map(String), tr) }))
  return parts.join(' · ')
}

/** The repeated cuts a year is part of (ADR-0099 §5), only the years up to that one. */
export function cutsOfYear(cuts: readonly RepeatedCutDto[], year: number): RepeatedCutDto[] {
  return cuts
    .map((c) => ({ ...c, years: c.years.filter((y) => y.year <= year) }))
    .filter((c) => c.years.length >= 2 && c.years.some((y) => y.year === year))
}

/** „Zum zweiten Mal gekürzt: Homeoffice-Pauschale 2023 und 2024, je 180 € weniger anerkannt.“ */
export function repeatedCutTitle(cut: RepeatedCutDto, tr: TFunction): string {
  const n = cut.years.length
  return n === 2 ? tr('verlauf.muster.mal_2') : n === 3 ? tr('verlauf.muster.mal_3') : tr('verlauf.muster.mal_n', { count: n })
}

export function repeatedCutSentence(cut: RepeatedCutDto, label: string, tr: TFunction): string {
  const title = repeatedCutTitle(cut, tr)
  // The cut is a deduction amount, not the tax effect the receipt shows next to it, so it says „weniger anerkannt“.
  const amounts = cut.years.map((y) => Math.abs(y.difference))
  if (amounts.every((a) => a === amounts[0])) {
    const jahre = joinList(cut.years.map((y) => String(y.year)), tr)
    return tr('verlauf.muster.satzJe', { titel: title, position: label, jahre, betrag: formatEuro(amounts[0] ?? 0) })
  }
  const years = cut.years.map((y) => tr('verlauf.muster.jahr', { jahr: y.year, betrag: formatEuro(Math.abs(y.difference)) }))
  return tr('verlauf.muster.satz', { titel: title, position: label, jahre: joinList(years, tr) })
}

export interface CoupleCopy {
  readonly text: string
  /** „Rechnung der App, etwa“ with the range, when the joint Bescheid was split by the filed facts. */
  readonly approximate: string | null
  /** The comparison's statement when it is no clear one. */
  readonly note: string | null
}

/** ADR-0099 §6: the comparison in both directions, worded by how the year was filed. */
export function coupleCopy(c: CoupleComparisonDto, tr: TFunction): CoupleCopy {
  const jahr = c.year
  if (c.status === 'tarif-fehlt') return { text: tr('verlauf.paare.tarifFehlt', { jahr }), approximate: null, note: null }
  if (c.status === 'unvollstaendig') {
    return { text: tr('verlauf.paare.unvollstaendig', { liste: joinList(missingPhrases(c.missing ?? [], tr), tr) }), approximate: null, note: null }
  }
  const saving = c.jointSaving ?? 0
  const range = c.approximate === true ? sameSignRange(c.jointSavingRange ?? null, saving) : null
  // On a joint Bescheid the split is the app's estimate: the sentence itself names the range, never one exact amount.
  const betrag = range ? tr('verlauf.paare.etwaBetrag', { von: formatEuro(range.low), bis: formatEuro(range.high) }) : formatEuro(Math.abs(Math.round(saving)))
  let text: string
  if (saving === 0) text = tr('verlauf.paare.gleich', { jahr })
  else if (c.filedAs === 'einzel') text = tr(saving > 0 ? 'verlauf.paare.zusammenMehr' : 'verlauf.paare.einzelnGebracht', { jahr, betrag })
  else text = tr(saving > 0 ? 'verlauf.paare.zusammenGebracht' : 'verlauf.paare.einzelnMehr', { jahr, betrag })
  const approximate = c.approximate === true ? tr(range ? 'verlauf.paare.etwaSpanne' : 'verlauf.paare.etwa') : null
  const note = c.statement === 'zu-knapp' || c.statement === 'unbestimmt' ? tr('verlauf.paare.knapp') : null
  return { text, approximate, note }
}

/** The range of the saving as two positive amounts, when it is a real range on the same side as the saving. */
function sameSignRange(range: { readonly from: number; readonly to: number } | null, saving: number): { low: number; high: number } | null {
  if (range === null || saving === 0) return null
  const ends = [range.from, range.to].map((v) => Math.round(v))
  if (!ends.every((v) => Math.sign(v) === Math.sign(saving))) return null
  const [low, high] = ends.map(Math.abs).sort((a, b) => a - b) as [number, number]
  return low === high ? null : { low, high }
}

/** The tabs of „Entwicklung“ for the groups (ADR-0099 §3, §7), each only when the household has data for it. */
export type HistoryGroupTab = 'vorauszahlungen' | 'schweiz' | 'vermietung' | 'kapital' | 'rente'

export function groupTabs(data: Pick<YearHistoryResponseDto, 'prepayments' | 'groups'>): HistoryGroupTab[] {
  const tabs: HistoryGroupTab[] = []
  if (data.prepayments.backPaymentYears > 0) tabs.push('vorauszahlungen')
  if ((data.groups.crossBorder?.years.length ?? 0) > 0) tabs.push('schweiz')
  if ((data.groups.rental?.properties.length ?? 0) > 0) tabs.push('vermietung')
  if ((data.groups.capital?.years.length ?? 0) > 0) tabs.push('kapital')
  if ((data.groups.pension?.years.length ?? 0) > 0) tabs.push('rente')
  return tabs
}

/** `31.12.2026` for a deadline. */
export const deadlineDate = (item: YearListItemDto): string => germanDate(item.deadline.endsOn)
