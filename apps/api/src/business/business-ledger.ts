// Pure helpers between the stored book and the core (no I/O): integrity, VAT figures from the
// journal, EÜR amounts in euros, fixed assets as the core's two views of them.
import {
  accountFor,
  assetSchedule,
  chartAccounts,
  checkNumbering,
  entriesDifferingFromLog,
  verifyLog,
  type ChartOfAccounts,
  type DepreciableAsset,
  type EuerKey,
  type FixedAsset,
  type JournalEntry,
  type Ledger,
  type LogRecord,
  type NetByRate,
} from '@steuereule/core'
import type { FixedAssetRecord } from './business.repository.js'

export type BookIntegrity =
  | { readonly ok: true; readonly entries: number; readonly headHash: string | null }
  | { readonly ok: false; readonly reason: string; readonly firstBadSeq?: number; readonly entries?: readonly number[] }

/**
 * Whether the book is as it was logged (GoBD): the hash chain unbroken, every entry exactly as logged,
 * the numbers gapless. Run on every read and before every export; the reason is German, for the user.
 */
export function bookIntegrity(ledger: Ledger, log: readonly LogRecord[]): BookIntegrity {
  const chain = verifyLog(log)
  if (!chain.ok) {
    return { ok: false, firstBadSeq: chain.firstBadSeq, reason: `Das Buchungsprotokoll ist ab Eintrag ${chain.firstBadSeq} nicht mehr unversehrt (${chain.reason === 'chain' ? 'Kette unterbrochen' : chain.reason === 'content' ? 'Inhalt verändert' : 'Nummernfolge gestört'}).` }
  }
  const differing = entriesDifferingFromLog(ledger.entries, log)
  if (differing.length > 0) return { ok: false, entries: differing, reason: `Buchung ${differing.join(', ')} weicht vom Protokoll ab.` }
  const numbering = checkNumbering(ledger.entries)
  if (numbering.missing.length > 0 || numbering.duplicates.length > 0) {
    return { ok: false, entries: [...numbering.missing, ...numbering.duplicates], reason: 'Die Buchungsnummern sind nicht lückenlos.' }
  }
  return { ok: true, entries: ledger.entries.length, headHash: chain.count === 0 ? null : chain.headHash }
}

export const eur = (cents: number): number => Math.round(cents) / 100
export const cents = (euros: number): number => Math.round(euros * 100)

/** The EÜR totals of the core in euros, for the tax rules which count in euros. */
export function byKeyInEuros(byKey: Readonly<Partial<Record<EuerKey, number>>>): Partial<Record<EuerKey, number>> {
  return Object.fromEntries(Object.entries(byKey).map(([key, value]) => [key, eur(value ?? 0)])) as Partial<Record<EuerKey, number>>
}

/**
 * The EÜR totals in euros with the non-deductible bookings of the restricted expenses taken out: an
 * entry on „Geschenke über der Freigrenze“ or „Bewirtung (nicht abziehbarer Teil)“ is listed in the
 * book but must not lower the profit (§ 4 Abs. 5 EStG). The fully non-deductible keys (Gewerbesteuer,
 * § 4 Abs. 4a, fines) are counted 0 by `euerProfit` already and stay as they are.
 */
export function deductibleByKeyInEuros(totals: { readonly byKey: Readonly<Partial<Record<EuerKey, number>>>; readonly nonDeductible: Readonly<Partial<Record<EuerKey, number>>> }): Partial<Record<EuerKey, number>> {
  const out = { ...totals.byKey }
  for (const [key, amount] of Object.entries(totals.nonDeductible) as [EuerKey, number][]) {
    // Bewirtung: euerProfit takes 70 % of the whole amount, so a booking split 70/30 must stay whole here.
    if (key.startsWith('beschraenkt_') && key !== 'beschraenkt_bewirtung') out[key] = Math.max(0, (out[key] ?? 0) - amount)
  }
  return byKeyInEuros(out)
}

/** The first account of the chart that lands on an EÜR key: the target of a quick-path total. */
export function accountForEuerKey(chart: ChartOfAccounts, key: EuerKey): string | null {
  const account = chartAccounts(chart).find((a) => a.euer === key && (a.kind === 'revenue' || a.kind === 'expense'))
  return account?.number ?? null
}

export const bankAccountOf = (chart: ChartOfAccounts): string => accountFor(chart, 'bank').number

export interface VatFigures {
  readonly taxableNetEur: NetByRate
  /** § 13b and ig. Erwerb together, as the annual return's computation takes them. */
  readonly reverseChargeNetEur: NetByRate
  readonly taxFreeWithDeductionEur: number
  readonly taxFreeWithoutDeductionEur: number
  readonly smallBusinessTurnoverEur: number
  readonly inputVatEur: number
  /** The parts of `reverseChargeNetEur` as the Voranmeldung lists them (ADR-0101 §22). */
  readonly intraEuAcquisitionNetEur: NetByRate
  readonly reverseChargeEuServicesNetEur: number
  readonly reverseChargeOtherNetEur: number
  /** B2B services to EU businesses, taxable there (§ 3a Abs. 2 UStG; Kz 21, Zusammenfassende Meldung). */
  readonly euServicesNetEur: number
}

/**
 * The VAT inputs read off the journal of a year, or of a period `[from, to]` of it (a Voranmeldung): net
 * turnover per rate from the base lines of the output keys (credit minus debit, so a Storno nets out),
 * input VAT from the tax lines of the input keys, reverse-charge net from their base lines.
 */
export function vatFiguresOf(entries: readonly JournalEntry[], year: number, period?: { readonly from: string; readonly to: string }): VatFigures {
  let standard = 0
  let reduced = 0
  let igStandard = 0
  let igReduced = 0
  let rcEu = 0
  let rcOther = 0
  let withDeduction = 0
  let withoutDeduction = 0
  let small = 0
  let euServices = 0
  let input = 0
  for (const entry of entries) {
    if (period ? entry.date < period.from || entry.date > period.to : Number(entry.date.slice(0, 4)) !== year) continue
    for (const line of entry.lines) {
      const signed = line.side === 'credit' ? line.amount : -line.amount
      if (line.taxPart === 'base') {
        if (line.taxKey === 'ust19') standard += signed
        else if (line.taxKey === 'ust7') reduced += signed
        else if (line.taxKey === 'igLieferung') withDeduction += signed
        else if (line.taxKey === 'steuerfrei') withoutDeduction += signed
        else if (line.taxKey === 'kleinunternehmer') small += signed
        else if (line.taxKey === 'euLeistung') euServices += signed
        else if (line.taxKey === 'rc13b19') rcOther -= signed
        else if (line.taxKey === 'rcEu19') rcEu -= signed
        else if (line.taxKey === 'igErwerb19') igStandard -= signed
        else if (line.taxKey === 'igErwerb7') igReduced -= signed
      } else if (line.taxPart === 'tax' && line.side === 'debit' && (line.taxKey === 'vst19' || line.taxKey === 'vst7')) {
        input += line.amount
      } else if (line.taxPart === 'tax' && line.side === 'credit' && (line.taxKey === 'vst19' || line.taxKey === 'vst7')) {
        input -= line.amount
      }
    }
  }
  return {
    taxableNetEur: { standard: eur(standard), reduced: eur(reduced) },
    reverseChargeNetEur: { standard: eur(rcEu + rcOther + igStandard), reduced: eur(igReduced) },
    taxFreeWithDeductionEur: eur(withDeduction),
    taxFreeWithoutDeductionEur: eur(withoutDeduction),
    smallBusinessTurnoverEur: eur(small),
    inputVatEur: eur(input),
    intraEuAcquisitionNetEur: { standard: eur(igStandard), reduced: eur(igReduced) },
    reverseChargeEuServicesNetEur: eur(rcEu),
    reverseChargeOtherNetEur: eur(rcOther),
    euServicesNetEur: eur(euServices),
  }
}

/** Per foreign VAT id the net amounts of the Zusammenfassende Meldung (§ 18a Abs. 7 UStG) in a period. */
export function ecSalesListOf(entries: readonly JournalEntry[], period: { readonly from: string; readonly to: string }): { vatId: string | null; goodsEur: number; servicesEur: number }[] {
  const byId = new Map<string, { goods: number; services: number }>()
  for (const entry of entries) {
    if (entry.date < period.from || entry.date > period.to) continue
    for (const line of entry.lines) {
      if (line.taxPart !== 'base' || (line.taxKey !== 'igLieferung' && line.taxKey !== 'euLeistung')) continue
      const key = entry.counterpartyVatId ?? ''
      const row = byId.get(key) ?? { goods: 0, services: 0 }
      const signed = line.side === 'credit' ? line.amount : -line.amount
      if (line.taxKey === 'igLieferung') row.goods += signed
      else row.services += signed
      byId.set(key, row)
    }
  }
  return [...byId.entries()]
    .filter(([, r]) => r.goods !== 0 || r.services !== 0)
    .map(([id, r]) => ({ vatId: id === '' ? null : id, goodsEur: eur(r.goods), servicesEur: eur(r.services) }))
    .sort((a, b) => (a.vatId ?? '').localeCompare(b.vatId ?? ''))
}

interface SpecialDepreciationFacts {
  readonly byYear?: Readonly<Record<string, number>>
  readonly costReduction?: number
}

interface DisposalFacts {
  readonly date: string
  readonly proceedsCents?: number
}

function parse<T>(value: string | null): T | null {
  if (value === null) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/** The stored asset as the tax rules' depreciation takes it (euros). */
export function depreciableOf(record: FixedAssetRecord): DepreciableAsset {
  const special = parse<SpecialDepreciationFacts>(record.specialDepreciation)
  const disposal = parse<DisposalFacts>(record.disposal)
  const method = (['linear', 'degressive', 'gwg', 'sofort', 'building'].includes(record.method) ? record.method : 'linear') as DepreciableAsset['method']
  return {
    id: record.id,
    acquired: record.acquisitionDate,
    netCostEur: eur(record.acquisitionCost),
    method,
    ...(record.usefulLifeYears !== null ? { usefulLifeYears: record.usefulLifeYears } : {}),
    ...(special?.costReduction ? { iabCostReductionEur: eur(special.costReduction) } : {}),
    ...(special?.byYear ? { specialDepreciation: Object.entries(special.byYear).map(([year, amount]) => ({ year: Number(year), amountEur: eur(amount) })) } : {}),
    ...(disposal ? { disposal: { date: disposal.date, proceedsEur: eur(disposal.proceedsCents ?? 0) } } : {}),
  }
}

/** The stored asset as the book's register takes it: cents and the yearly depreciation the rules computed. */
export function registerAssetOf(record: FixedAssetRecord, throughYear: number): FixedAsset {
  const schedule = assetSchedule(depreciableOf(record), throughYear)
  const disposal = parse<DisposalFacts>(record.disposal)
  return {
    id: record.id,
    label: record.label,
    account: record.account,
    acquisitionDate: record.acquisitionDate,
    acquisitionCost: record.acquisitionCost,
    depreciationByYear: Object.fromEntries(schedule.map((row) => [row.year, cents(row.depreciationEur + row.specialDepreciationEur + row.costReductionEur)])),
    ...(disposal ? { disposal: { date: disposal.date, ...(disposal.proceedsCents ? { proceedsNet: disposal.proceedsCents } : {}) } } : {}),
  }
}

/**
 * The entries of one book for the VAT, with the tax keys of today: entries booked before ADR-0101 §22
 * carry `ust0` on the EU-services revenue account and `rc13b19` on the EU-services expense account;
 * they mean Kz 21 and Kz 46/47. Only the own book's entries, never ones borrowed for § 11 (they are
 * dated in the other year and would count twice).
 */
export function vatEntriesOf(chart: ChartOfAccounts, entries: readonly JournalEntry[]): JournalEntry[] {
  const euRevenue = accountFor(chart, 'revenue_eu_services').number
  const euServices = accountFor(chart, 'services_eu_13b_19').number
  return entries.map((entry) =>
    entry.lines.some((l) => (l.account === euRevenue && l.taxKey === 'ust0') || (l.account === euServices && l.taxKey === 'rc13b19'))
      ? { ...entry, lines: entry.lines.map((l) => (l.account === euRevenue && l.taxKey === 'ust0' ? { ...l, taxKey: 'euLeistung' as const } : l.taxKey === 'rc13b19' && entry.lines.some((x) => x.account === euServices) ? { ...l, taxKey: 'rcEu19' as const } : l)) }
      : entry,
  )
}
