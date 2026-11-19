import type { TFunction } from 'i18next'
import type { OpenItemDto, YearHistoryEntryDto, YearHistoryResponseDto, YearListItemDto } from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { germanDate, missingPhrases, signedEuro, signedFigureText } from './historyFormat'
import { daysUntil, isLastChance } from './historyInsights'

/**
 * The Verlauf as a timeline (ADR-0098 §1, alternative A): one plain phrase per year, one amount, and
 * the single most urgent item for „Jetzt wichtig“. Pure, so the wording is tested without a screen.
 */

export interface YearStatus {
  readonly text: string
  /** Only a Bescheid that cut the refund is coloured. */
  readonly tone: 'bad' | null
}

const KIND_RANK: Readonly<Record<OpenItemDto['kind'], number>> = { einspruchsfrist: 0, 'wartet-auf-bescheid': 1, offen: 2 }

/** The days left of an item with a running deadline: the Einspruchsfrist, or the last chance to file a year (ADR-0099 §1). */
function deadlineDays(item: OpenItemDto, today: string | undefined): number | null {
  if (item.kind === 'einspruchsfrist' && item.deadline?.running) return item.deadline.remainingDays
  if (today !== undefined && isLastChance(item, today)) return daysUntil(today, item.filingDeadline!)
  return null
}

/**
 * The open items, most urgent first: running deadlines by the days they have left (the Einspruchsfrist,
 * a year whose filing ends this year), then the highlighted item, waiting years, open years; newer first within a kind.
 */
export function urgentFirst(items: readonly OpenItemDto[], today?: string): OpenItemDto[] {
  const days = (i: OpenItemDto) => deadlineDays(i, today) ?? Number.POSITIVE_INFINITY
  return [...items].sort((a, b) => days(a) - days(b) || Number(b.highlighted) - Number(a.highlighted) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.year - a.year)
}

/** The Lohnsteuerbescheinigung and the figures that come from it; `einkommen` is what an employee lacks without it. */
const LSTB_IDS = new Set(['lohnsteuerbescheinigung', 'einkommen', 'bruttoarbeitslohn', 'lohnsteuer', 'solidaritaetszuschlag', 'kirchensteuer', 'sozialversicherung'])
const SHORT_IDS = new Set(['werbungskosten', 'rente', 'veranlagungsart', 'wechselkurs'])

interface MissingGroups {
  /** Whose Lohnsteuerbescheinigung is missing: 'A' and/or 'B'. */
  readonly lstb: readonly ('A' | 'B')[]
  /** The other ids, as the API named them. */
  readonly rest: readonly string[]
}

function groupMissing(ids: readonly string[]): MissingGroups {
  const lstb: ('A' | 'B')[] = []
  const rest: string[] = []
  for (const raw of ids) {
    const forB = raw.startsWith('personB.')
    const id = forB ? raw.slice('personB.'.length) : raw
    if (LSTB_IDS.has(id)) {
      const who = forB ? 'B' : 'A'
      if (!lstb.includes(who)) lstb.push(who)
    } else if (!rest.includes(raw)) rest.push(raw)
  }
  return { lstb, rest }
}

/** „2 Lohnsteuerbescheinigungen fehlen“, „Werbungskosten fehlen, +1 weitere“: what an open year lacks, in a few words. */
export function missingShort(ids: readonly string[], tr: TFunction): string {
  const { lstb, rest } = groupMissing(ids)
  const parts: string[] = []
  if (lstb.length > 0) parts.push(tr('verlauf.fehltKurz.lohnsteuerbescheinigung', { count: lstb.length }))
  const restIds = [...new Set(rest.map((r) => r.replace(/^personB\./, '')))]
  for (const id of restIds) parts.push(tr(`verlauf.fehltKurz.${SHORT_IDS.has(id) ? id : 'sonstiges'}`))
  const unique = [...new Set(parts)]
  if (unique.length === 0) return ''
  return unique.length === 1 ? unique[0]! : tr('verlauf.fehltKurz.mehr', { erstes: unique[0], count: unique.length - 1 })
}

/**
 * What an open year lacks, concretely: the Lohnsteuerbescheinigungen with the month they come in while
 * the year is not yet transmitted, then the other ids in the words of the Verlauf.
 */
export function missingDetail(ids: readonly string[], year: number, today: string, tr: TFunction): string[] {
  const { lstb, rest } = groupMissing(ids)
  const out: string[] = []
  if (lstb.length > 0) {
    // The employer transmits the Lohnsteuerbescheinigung by the end of February of the next year.
    const pending = today < `${year + 1}-03-01`
    const key = lstb.length > 1 ? 'beide' : lstb[0] === 'B' ? 'personB' : 'eine'
    out.push(tr(`verlauf.jahr.lstb.${key}${pending ? 'Kommt' : ''}`, { jahr: year, folgejahr: year + 1 }))
  }
  out.push(...missingPhrases(rest, tr))
  return out
}

/** A year without data of its own (ADR-0099 §1): filed elsewhere, asked, answered „Nein“, or not in the app. */
function gapStatus(item: YearListItemDto, tr: TFunction): YearStatus {
  const datum = germanDate(item.deadline.endsOn)
  const answer = item.filedElsewhere?.answer ?? null
  if (answer === 'ja' || item.withoutAssessment) return { text: tr('verlauf.zeile.anderswo'), tone: null }
  if (item.filedElsewhere?.ask === true) return { text: tr('verlauf.zeile.frage'), tone: null }
  return { text: tr(answer === 'nein' ? 'verlauf.zeile.nichtAbgegeben' : 'verlauf.zeile.nichtInApp', { datum }), tone: null }
}

/** „· änderbar bis 31.12.2028“ for an assessed year whose Festsetzungsfrist runs, unless the Bescheid changed something (that row says the change). */
function withChangeableUntil(status: YearStatus, item: YearListItemDto, tr: TFunction): YearStatus {
  const changed = (item.difference !== null && item.difference !== 0) || item.deviations > 0
  if (item.deadline.kind !== 'aenderbar-bis' || !item.deadline.running || changed) return status
  return { ...status, text: tr('verlauf.zeile.aenderbar', { stand: status.text, datum: germanDate(item.deadline.endsOn) }) }
}

/** The year's one phrase in the timeline: „in Arbeit · …“, „abgegeben · wartet auf Bescheid“, „Bescheid · 92 € weniger als erklärt“, „nur Bescheid · änderbar bis …“, „noch nicht abgegeben · bis … möglich“. */
export function yearStatus(item: YearListItemDto, entry: YearHistoryEntryDto | undefined, tr: TFunction): YearStatus {
  if (!item.hasData || item.withoutAssessment) return gapStatus(item, tr)
  switch (item.kind) {
    case 'offen': {
      const what = missingShort(entry?.missing ?? [], tr)
      return { text: what === '' ? tr('verlauf.zeile.offen') : tr('verlauf.zeile.offenMit', { was: what }), tone: null }
    }
    case 'eingereicht':
      return { text: tr('verlauf.zeile.eingereicht'), tone: null }
    case 'eckjahr':
      return withChangeableUntil({ text: tr('verlauf.zeile.nurBescheid'), tone: null }, item, tr)
    case 'bescheid': {
      if (item.difference !== null && item.difference < 0) return { text: tr('verlauf.zeile.weniger', { betrag: formatEuro(Math.abs(item.difference)) }), tone: 'bad' }
      if (item.difference !== null && item.difference > 0) return { text: tr('verlauf.zeile.mehr', { betrag: formatEuro(item.difference) }), tone: null }
      if (item.deviations > 0) return { text: tr('verlauf.zeile.aenderungen', { count: item.deviations }), tone: null }
      return withChangeableUntil({ text: tr(item.noDiffReason === null ? 'verlauf.zeile.wieErklaert' : 'verlauf.zeile.ohneAbgleich'), tone: null }, item, tr)
    }
  }
}

/** The year's one amount: the refund laut Bescheid, else the estimate as its range (never a midpoint, ADR-0032), else „–“; never one for a year without data (ADR-0099 §1). */
export function yearAmount(item: YearListItemDto, entry: YearHistoryEntryDto | undefined): string {
  if (!item.hasData) return '–'
  if (item.assessedRefund !== null) return signedEuro(item.assessedRefund)
  return entry ? signedFigureText(entry.erstattung.amount, '–') : '–'
}

/** The declared refund for the wide table: the filed figure, or for a filed year its estimate range. */
export function declaredAmount(item: YearListItemDto, entry: YearHistoryEntryDto | undefined): string {
  if (!item.hasData) return '–'
  if (item.kind === 'eingereicht' && entry) return signedFigureText(entry.erstattung.amount, '–')
  return item.declaredRefund === null ? '–' : signedEuro(item.declaredRefund)
}

/** The filing type changed against the year before: `zusammen` / `einzel` from this year on, else null. */
export function filingTypeChange(data: YearHistoryResponseDto, year: number): YearListItemDto['filingType'] | null {
  const item = data.list.find((l) => l.year === year)
  const before = data.list.find((l) => l.year === year - 1)
  return item && before && item.filingType !== before.filingType ? item.filingType : null
}
