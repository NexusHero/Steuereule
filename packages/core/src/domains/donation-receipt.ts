/**
 * Reads a German Zuwendungsbestätigung (§ 10b EStG, ADR-0080) so several receipts add up to the year's
 * donations without counting one donation twice. Real cases show three ways a donation comes back:
 * - a Sammelbestätigung lists every donation with its booking number;
 * - a second receipt for one donor (one partner's own donor number) repeats a booking of the joint one;
 * - a copy („Doppel“, „Zweitschrift“) repeats a receipt, often without its booking list.
 * Each donation becomes an item: its booking number when printed, and always issuer, amount and year.
 */

export interface DonationItem {
  /** The booking number of this donation, when the receipt lists one. */
  readonly ref: string | null
  /** Issuer, amount in cents and year: how a copy without booking numbers is recognised. */
  readonly amountKey: string
  readonly amountCents: number
}

export interface DonationReceiptRead {
  /** The receipt's total in whole euros. */
  readonly totalEur: number | null
  /** The year the donations were made (period of the Sammelbestätigung or date of donation). */
  readonly taxYear: number | null
  /** A copy of an earlier receipt („Doppel“, „Zweitschrift“). */
  readonly isCopy: boolean
  readonly items: readonly DonationItem[]
}

const RECEIPT = /zuwendungsbest|sammelbest|spendenbescheinigung|spendenquittung|bestätigung über (?:geld|sach|mitglieds)|im sinne des § ?10b/i

export function looksLikeDonationReceipt(text: string): boolean {
  return RECEIPT.test(text ?? '')
}

/** „1.380,00“, „120.00“, „1 234,56“: the last separator before two digits is the decimal point. */
const AMOUNT = /\d{1,3}(?:[.\s']\d{3})+[,.]\d{2}(?!\d)|\d+[,.]\d{2}(?!\d)/g

function cents(token: string): number {
  const digits = token.replace(/[^\d]/g, '')
  return Number(digits)
}

function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT)].map((m) => cents(m[0]))
}

function issuerOf(lines: readonly string[]): string {
  const stated = lines.map((l) => /aussteller(?:in)?\s*:?\s*([^,\n]+)/i.exec(l)?.[1]).find(Boolean)
  const name = stated ?? lines.find((l) => /\be\.\s?v\.|stiftung|ggmbh|gemeinnützig/i.test(l)) ?? ''
  return name.toLowerCase().replace(/[^a-zäöüß0-9]/g, '')
}

const BOOKING = /^\s*([A-Z]{0,4}\d[\dA-Z-]{5,})\s+(\d{2}\.\d{2}\.(20\d{2}))\b/

export function parseDonationReceipt(text: string): DonationReceiptRead {
  const lines = (text ?? '').split(/\r?\n/)
  const flat = lines.join('\n')
  const period = /\d{2}\.\d{2}\.20\d{2}\s*(?:bis|-|–)\s*\d{2}\.\d{2}\.(20\d{2})/.exec(flat)?.[1]
  const donated = /(?:datum der zuwendung|tag der zuwendung)[^\d]{0,60}\d{2}\.\d{2}\.(20\d{2})/i.exec(flat)?.[1]

  const bookings = lines
    .map((l) => ({ m: BOOKING.exec(l), amounts: amountsIn(l) }))
    .filter((b) => b.m !== null && b.amounts.length > 0)
    .map((b) => ({ ref: b.m![1]!, year: Number(b.m![3]), amountCents: b.amounts.at(-1)! }))
  const year = period ? Number(period) : donated ? Number(donated) : (bookings.at(-1)?.year ?? null)

  // The total: „Gesamtsumme …“, else the amount after „Gesamtbetrag der Zuwendung“ / „Betrag der Zuwendung“.
  const sumLine = lines.filter((l) => /gesamtsumme|summe\s+der\s+zuwendungen/i.test(l) && amountsIn(l).length > 0).at(-1)
  let totalCents = sumLine ? amountsIn(sumLine).at(-1)! : null
  if (totalCents === null) {
    const at = lines.findIndex((l) => /(?:gesamt)?betrag der zuwendung/i.test(l))
    const near = at >= 0 ? lines.slice(at, at + 4).flatMap(amountsIn) : []
    totalCents = near[0] ?? null
  }
  if (totalCents === null && bookings.length > 0) totalCents = bookings.reduce((s, b) => s + b.amountCents, 0)

  const issuer = issuerOf(lines)
  const key = (c: number) => `${issuer}|${c}|${year ?? ''}`
  const bookingSum = bookings.reduce((s, b) => s + b.amountCents, 0)
  const items: DonationItem[] =
    bookings.length > 0 && (totalCents === null || Math.abs(bookingSum - totalCents) <= 1)
      ? bookings.map((b) => ({ ref: b.ref, amountKey: key(b.amountCents), amountCents: b.amountCents }))
      : totalCents !== null && totalCents > 0
        ? [{ ref: null, amountKey: key(totalCents), amountCents: totalCents }]
        : []

  return {
    totalEur: totalCents === null ? null : Math.round(totalCents / 100),
    taxYear: year,
    isCopy: /\b(?:doppel|zweitschrift|duplikat|zweitausfertigung)\b/i.test(flat),
    items,
  }
}

/** The same donation: the same booking number, or — when one side has none — the same issuer, amount and year. */
export function sameDonation(a: Pick<DonationItem, 'ref' | 'amountKey'>, b: Pick<DonationItem, 'ref' | 'amountKey'>): boolean {
  if (a.ref !== null && b.ref !== null) return a.ref === b.ref
  return a.amountKey === b.amountKey
}

/** The donations of this receipt not yet counted, and those already counted (to tell the user). */
export function uncountedDonations(
  items: readonly DonationItem[],
  counted: readonly Pick<DonationItem, 'ref' | 'amountKey'>[],
): { readonly fresh: readonly DonationItem[]; readonly repeated: readonly DonationItem[] } {
  const fresh: DonationItem[] = []
  const repeated: DonationItem[] = []
  for (const item of items) (counted.some((c) => sameDonation(item, c)) ? repeated : fresh).push(item)
  return { fresh, repeated }
}
