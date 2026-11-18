import type { TFunction } from 'i18next'
import type { YearHistoryEntryDto, YearListItemDto } from '@steuereule/api-client'
import { formatEuro } from '@steuereule/core'
import { netFor, workFor } from './historyChartModel'
import { bounds, exactValue, joinList, newestFirst, percent, signedFigureText, signedPercent, type HistoryMetric, type HistoryPerson } from './historyFormat'

/**
 * The owl's one sentence under a chart (ADR-0098 §7): built only from the core's numbers, no free
 * reading, no forecast for a year without a Bescheid.
 */
export function owlSentence(metric: HistoryMetric, entries: readonly YearHistoryEntryDto[], list: readonly YearListItemDto[], person: HistoryPerson, tr: TFunction): string {
  switch (metric) {
    case 'erstattung':
      return refundSentence(entries, list, tr)
    case 'werbungskosten':
      return workSentence(entries, person, tr)
    case 'netto':
      return netSentence(entries, person, tr)
    case 'steuerquote':
      return quoteSentence(entries, tr)
  }
}

function refundSentence(entries: readonly YearHistoryEntryDto[], list: readonly YearListItemDto[], tr: TFunction): string {
  const parts: string[] = []
  const compared = list.filter((l) => l.declaredRefund !== null && l.assessedRefund !== null && l.difference !== null)
  if (compared.length > 0) {
    const changed = compared.filter((l) => l.difference !== 0)
    parts.push(tr('verlauf.eule.erstattung.bilanz', { count: compared.length, gleich: compared.length - changed.length }))
    for (const l of changed) {
      const amount = formatEuro(Math.abs(l.difference ?? 0))
      parts.push(tr((l.difference ?? 0) < 0 ? 'verlauf.eule.erstattung.gekuerzt' : 'verlauf.eule.erstattung.mehr', { jahr: l.year, betrag: amount }))
    }
  }
  const estimated = newestFirst(entries).find((e) => e.erstattung.amount.tier === 'schaetzung')
  if (estimated) parts.push(tr('verlauf.eule.erstattung.schaetzung', { jahr: estimated.year, spanne: signedFigureText(estimated.erstattung.amount, '') }))
  const single = entries.filter((e) => e.erstattung.sumOfSingleFilings && e.erstattung.amount.tier !== 'offen').map((e) => String(e.year))
  if (single.length > 0) parts.push(tr('verlauf.eule.erstattung.einzeln', { count: single.length, jahre: joinList(single, tr) }))
  return parts.length > 0 ? parts.join(' ') : tr('verlauf.eule.erstattung.leer')
}

const PART_KEYS = ['fahrtweg', 'homeoffice', 'arbeitsmittel', 'sonstiges'] as const

function workSentence(entries: readonly YearHistoryEntryDto[], person: HistoryPerson, tr: TFunction): string {
  const household = entries.some((e) => e.persons.includes('B'))
  const people: readonly ('A' | 'B')[] = person === 'beide' ? ['A', 'B'] : [person]
  const below: string[] = []
  for (const e of entries) {
    for (const p of people) {
      const w = workFor(e, p)
      const total = exactValue(w?.total) ?? bounds(w?.total)?.to ?? null
      if (w?.belowLumpSum === true && total !== null) {
        below.push(household ? tr('verlauf.eule.werbungskosten.personJahr', { person: tr(`verlauf.person.${p}`), jahr: e.year, betrag: formatEuro(total) }) : tr('verlauf.eule.werbungskosten.jahr', { jahr: e.year, betrag: formatEuro(total) }))
      }
    }
  }
  const first = below.length > 0 ? tr('verlauf.eule.werbungskosten.unter', { liste: joinList(below, tr) }) : entries.some((e) => workFor(e, person)?.total.tier !== 'offen') ? tr('verlauf.eule.werbungskosten.ueber') : ''
  const latest = newestFirst(entries).find((e) => workFor(e, person)?.parts != null)
  let second = ''
  const latestParts = latest ? workFor(latest, person)?.parts : null
  if (latest && latestParts) {
    const top = [...PART_KEYS].sort((a, b) => latestParts[b] - latestParts[a])[0]!
    if (latestParts[top] > 0) second = tr('verlauf.eule.werbungskosten.groesster', { jahr: latest.year, teil: tr(`verlauf.teil.${top}`), betrag: formatEuro(latestParts[top]) })
  }
  const text = [first, second].filter((s) => s !== '').join(' ')
  return text === '' ? tr('verlauf.eule.werbungskosten.leer') : text
}

function netSentence(entries: readonly YearHistoryEntryDto[], person: HistoryPerson, tr: TFunction): string {
  const known = entries.filter((e) => exactValue(netFor(e, person)?.brutto) !== null && exactValue(netFor(e, person)?.netto) !== null)
  if (known.length === 0) return tr('verlauf.eule.netto.leer')
  const last = known[known.length - 1]!
  const quoteOf = (e: YearHistoryEntryDto) => {
    const n = netFor(e, person)!
    return exactValue(n.nettoQuote) ?? (exactValue(n.netto)! / exactValue(n.brutto)!) * 100
  }
  if (known.length === 1) return tr('verlauf.eule.netto.einJahr', { jahr: last.year, quote: percent(quoteOf(last)) })
  const first = known[0]!
  const b1 = exactValue(netFor(first, person)!.brutto)!
  const b2 = exactValue(netFor(last, person)!.brutto)!
  const n1 = exactValue(netFor(first, person)!.netto)!
  const n2 = exactValue(netFor(last, person)!.netto)!
  return tr('verlauf.eule.netto.verlauf', {
    von: first.year,
    bis: last.year,
    brutto: signedPercent((b2 / b1 - 1) * 100),
    netto: signedPercent((n2 / n1 - 1) * 100),
    quoteBis: percent(quoteOf(last)),
    quoteVon: percent(quoteOf(first)),
  })
}

function quoteSentence(entries: readonly YearHistoryEntryDto[], tr: TFunction): string {
  const latest = newestFirst(entries).find((e) => exactValue(e.steuerquote.effective) !== null)
  if (!latest) return tr('verlauf.eule.steuerquote.leer')
  const quote = percent(exactValue(latest.steuerquote.effective)!)
  const marginal = exactValue(latest.steuerquote.marginal)
  return marginal === null
    ? tr('verlauf.eule.steuerquote.ohneGrenz', { jahr: latest.year, quote })
    : tr('verlauf.eule.steuerquote.mitGrenz', { jahr: latest.year, grenz: Math.round(marginal), quote })
}
