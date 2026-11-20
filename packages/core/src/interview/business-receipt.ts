// A business receipt (Rechnung, Quittung) read into a booking draft (ADR-0101 §6, §18, ADR-0097): the
// one receipt pipeline reads the text, this module turns what it found into a draft the user takes or not.
// It guesses nothing it cannot read: without a total there is no draft; the account is a proposal.
import { USEFUL_LIVES, type AssetCategory } from '../domains/business/depreciation'
import { accountFor, type AccountConceptId, type BookingTaxKey, type ChartOfAccounts } from '../domains/ledger/accounts'
import { isBookingDate, vatFromGross, type IsoDate } from '../domains/ledger/journal'
import type { BookingDraft } from './booking-draft'

export interface BusinessReceiptRead {
  /** The total to pay in cents (gross). */
  readonly grossCents: number | null
  /** The VAT rate the receipt states; 0 for an invoice without VAT (Kleinunternehmer, § 19 UStG). */
  readonly vatRate: 19 | 7 | 0 | null
  readonly date: IsoDate | null
  readonly invoiceNumber: string | null
  /** A short description for the booking text: the first item line or the issuer's line. */
  readonly description: string
}

export type ReceiptDirection = 'ausgabe' | 'einnahme'

// Either grouped thousands („1.234,56“, „1 234,56“) or plain digits („1234,56“, „12.34“); the two branches
// cannot both match the same digits, and bounded repeats (up to 999 Mrd. €) keep the pattern linear on long text.
const AMOUNT = String.raw`(\d{1,3}(?:[.\s]\d{3}){1,4},\d{2}|\d{1,12}[.,]\d{2})`
const TOTAL_LABELS = /(gesamtbetrag|rechnungsbetrag|zu\s+zahlen(?:der\s+betrag)?|endbetrag|summe\s+brutto|bruttobetrag|gesamt\s*\(brutto\)|gesamtsumme|gesamt\b|brutto\b|summe|total|betrag)/i

function cents(raw: string): number {
  const normalized = raw.includes(',') ? raw.replaceAll(/[.\s]/g, '').replace(',', '.') : raw
  return Math.round(Number(normalized) * 100)
}

function readTotal(lines: readonly string[]): number | null {
  // The last labelled amount wins: invoices list Netto, USt and then the Gesamtbetrag.
  let found: number | null = null
  for (const line of lines) {
    if (!TOTAL_LABELS.test(line) || /netto|zwischensumme|mwst|ust\b|umsatzsteuer|rabatt/i.test(line)) continue
    const amounts = [...line.matchAll(new RegExp(AMOUNT, 'g'))].map((m) => cents(m[1]!))
    const last = amounts.at(-1)
    if (last !== undefined && last > 0) found = last
  }
  return found
}

function readRate(text: string): 19 | 7 | 0 | null {
  if (/§\s*19\s*UStG|kleinunternehmer|ohne\s+(?:ausweis\s+der\s+)?umsatzsteuer|umsatzsteuerfrei/i.test(text)) return 0
  if (/\b19(?:,0+)?\s?%/.test(text)) return 19
  if (/\b7(?:,0+)?\s?%/.test(text)) return 7
  return null
}

function readDate(text: string): IsoDate | null {
  const labelled = /(rechnungsdatum|datum|belegdatum|leistungsdatum)\D{0,12}(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i.exec(text)
  const any = labelled ?? /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/.exec(text)
  if (!any) return null
  const [d, m, y] = labelled ? [labelled[2]!, labelled[3]!, labelled[4]!] : [any[1]!, any[2]!, any[3]!]
  const year = y.length === 2 ? `20${y}` : y
  const iso = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isBookingDate(iso) ? iso : null
}

function readInvoiceNumber(text: string): string | null {
  const match = /(rechnungs?-?\s?(?:nr|nummer)|beleg-?\s?(?:nr|nummer)|invoice\s?(?:no|number))[.:\s]{0,4}([A-Z0-9][A-Z0-9/_-]{1,30})/i.exec(text)
  return match ? match[2]! : null
}

/** What the receipt text says: total, VAT rate, date, number. Pure, no model. */
export function readBusinessReceipt(text: string): BusinessReceiptRead {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
  const candidate = (l: string) => /[a-zäöü]{4,}/i.test(l) && !TOTAL_LABELS.test(l) && !/rechnung|quittung|datum|nr\.|ust-id|steuernummer|iban|bic|straße|str\.|\d{5}\s|gmbh|\bag\b|\bkg\b|e\.\s?k\.|danke|netto|mwst|ust\b/i.test(l)
  // An item that names an asset or a known expense says more than the issuer's line.
  const item = lines.find((l) => candidate(l) && (ASSET_WORDS.some(([re]) => re.test(l)) || KNOWN_EXPENSES.test(l))) ?? lines.find(candidate)
  return {
    grossCents: readTotal(lines),
    vatRate: readRate(text),
    date: readDate(text),
    invoiceNumber: readInvoiceNumber(text),
    description: (item ?? 'Beleg').slice(0, 80),
  }
}

/** Words that name an asset with an official useful life (AfA-Tabelle), for the depreciation proposal. */
const ASSET_WORDS: readonly [RegExp, AssetCategory][] = [
  [/notebook|laptop|computer|rechner|monitor|bildschirm|drucker|scanner|macbook|ipad|tablet/i, 'computer'],
  [/software|lizenz/i, 'software'],
  [/smartphone|handy|mobiltelefon|iphone/i, 'mobile_phone'],
  [/schreibtisch|bürostuhl|buerostuhl|regal|schrank|möbel|moebel/i, 'office_furniture'],
  [/kamera|objektiv|mikrofon/i, 'camera_audio_video'],
  [/beamer|projektor/i, 'projector'],
]

const KNOWN_EXPENSES = /büro|buero|papier|toner|telefon|mobilfunk|internet|fachbuch|zeitschrift/i

const GWG_LIMIT_CENTS = 80_000
const IMMEDIATE_LIMIT_CENTS = 25_000

export type ReceiptDraftResult =
  | { readonly ok: true; readonly draft: BookingDraft; readonly notes: readonly string[] }
  | { readonly ok: false; readonly reason: string }

/**
 * The booking draft of a receipt: an expense (or income) against the bank, the VAT by the stated rate,
 * and for an asset the depreciation by the official table (GWG up to 800 € net, ADR-0101 §7). The
 * account is a proposal from the text; the user changes it before taking the draft.
 */
export function bookingDraftFromReceipt(
  read: BusinessReceiptRead,
  context: { readonly chart: ChartOfAccounts; readonly smallBusiness: boolean; readonly year: number; readonly direction: ReceiptDirection; readonly receiptRef?: string | undefined },
): ReceiptDraftResult {
  if (read.grossCents === null || read.grossCents <= 0) return { ok: false, reason: 'Auf dem Beleg steht kein lesbarer Gesamtbetrag.' }
  const notes: string[] = []
  const date = read.date !== null && Number(read.date.slice(0, 4)) === context.year ? read.date : `${context.year}-12-31`
  if (read.date === null) notes.push('Das Belegdatum war nicht lesbar; bitte das Zahlungsdatum eintragen.')
  else if (date !== read.date) notes.push(`Der Beleg ist vom ${read.date}, gebucht wird im Buch ${context.year}; bitte das Zahlungsdatum prüfen.`)
  const bank = accountFor(context.chart, 'bank').number
  const rate = context.smallBusiness ? 0 : (read.vatRate ?? 19)
  if (!context.smallBusiness && read.vatRate === null) notes.push('Der Steuersatz war nicht lesbar; angenommen sind 19 %.')
  const base = {
    date,
    documentNumber: read.invoiceNumber ?? `Beleg-${date}`,
    ...(context.receiptRef ? { receiptRef: context.receiptRef } : {}),
    text: read.description,
  }
  if (context.direction === 'einnahme') {
    const revenue: AccountConceptId = context.smallBusiness ? 'revenue_kleinunternehmer' : rate === 7 ? 'revenue_7' : 'revenue_19'
    const taxKey: BookingTaxKey = context.smallBusiness ? 'kleinunternehmer' : rate === 7 ? 'ust7' : rate === 0 ? 'steuerfrei' : 'ust19'
    return {
      ok: true,
      notes,
      draft: { ...base, lines: [{ account: bank, side: 'debit', amount: read.grossCents }, { account: accountFor(context.chart, revenue).number, side: 'credit', amount: read.grossCents, taxKey }] },
    }
  }
  const inputKey: BookingTaxKey = rate === 19 ? 'vst19' : rate === 7 ? 'vst7' : 'none'
  const net = rate === 0 ? read.grossCents : read.grossCents - vatFromGross(read.grossCents, rate)
  const category = ASSET_WORDS.find(([re]) => re.test(read.description))?.[1]
  let concept: AccountConceptId = 'other_operating_expenses'
  let asset: BookingDraft['asset']
  if (category !== undefined && net > IMMEDIATE_LIMIT_CENTS) {
    if (net <= GWG_LIMIT_CENTS) {
      concept = 'gwg'
      asset = { label: read.description, method: 'gwg', category }
      notes.push('Geringwertiges Wirtschaftsgut: im Jahr der Anschaffung voll abgeschrieben (§ 6 Abs. 2 EStG).')
    } else {
      concept = category === 'software' ? 'software' : 'office_equipment'
      asset = { label: read.description, method: 'linear', category, usefulLifeYears: USEFUL_LIVES[category].years }
      notes.push(`Anlagegut: lineare AfA über ${USEFUL_LIVES[category].years} Jahr(e) laut AfA-Tabelle (${USEFUL_LIVES[category].label}).`)
    }
  } else if (/büro|buero|papier|toner|stift|ordner/i.test(read.description)) concept = 'office_supplies'
  else if (/telefon|mobilfunk|internet|dsl/i.test(read.description)) concept = 'phone'
  else if (/fachbuch|zeitschrift|abo/i.test(read.description)) concept = 'literature'
  else notes.push('Das Konto ist ein Vorschlag (sonstige betriebliche Aufwendungen); bitte prüfen.')
  return {
    ok: true,
    notes,
    draft: {
      ...base,
      lines: [{ account: accountFor(context.chart, concept).number, side: 'debit', amount: read.grossCents, taxKey: inputKey }, { account: bank, side: 'credit', amount: read.grossCents }],
      ...(asset ? { asset } : {}),
    },
  }
}
