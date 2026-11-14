/**
 * Reads a craftsman's invoice for § 35a Abs. 3 EStG: only labour, machine and travel costs count,
 * including VAT; material never does (ADR-0078). Real invoices say it in one of two ways:
 * - the invoice states it („…sind 207,06 € inkl. 19 % MwSt. Lohnkosten enthalten“);
 * - it lists positions in hours, assembly, travel or machine work, with the invoice's VAT on top.
 * The read is a suggestion for the user to check (the share is a judgement the tax office may ask
 * about), never a figure taken as read.
 */

export interface LabourPosition {
  /** The position line as printed, for the user to check. */
  readonly text: string
  readonly netEur: number
}

export interface CraftsmanInvoiceRead {
  /** Labour share including VAT, whole euros; null when the invoice shows none. */
  readonly labourEur: number | null
  /** The invoice total including VAT, whole euros. */
  readonly invoiceTotalEur: number | null
  readonly source: 'stated' | 'positions' | null
  readonly vatRate: number | null
  readonly labourPositions: readonly LabourPosition[]
  readonly taxYear: number | null
  /** The invoice mentions a public subsidy (BAFA, KfW …): § 35a then does not apply (Abs. 3 Satz 2). */
  readonly subsidyHint: boolean
  /** An order confirmation or a quote: § 35a needs the invoice and a bank transfer. */
  readonly notAnInvoice: boolean
}

const AMOUNT = /\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|\d{4,},\d{2}(?!\d)/g

function euros(token: string): number {
  return Number(token.replace(/\./g, '').replace(',', '.'))
}

function lastAmount(line: string): number | null {
  const all = [...line.matchAll(AMOUNT)]
  return all.length > 0 ? euros(all.at(-1)![0]) : null
}

const LABOUR = /\b(?:std|stunden?|stundenlohn|stundensatz|arbeitszeit|arbeitslohn|lohn|montage|\S*-montage|demontage|wiedermontage|teilmontage|abfahrt|anfahrt|fahrtkosten|bagger\w*|maschine\w*|arbeiten|installation|inbetriebnahme|baustelleneinrichtung|einbau|ausbau|monteur\w*|facharbeiter|hilfsarbeiter|\S*bohrung|\S*herstell\w*|verleg\w*|abdicht\w*|reparatur\w*|wartung|reinigung|\S*arbeiten)\b/i
const MATERIAL = /material|lieferung|\bware\b|modul|speicher|wechselrichter|kleineisen|befestigung/i
const SUMMARY = /summe|gesamt|netto|brutto|\bust\b|ust\.|mwst|mehrwert|betrag|abschlag|zahlung|rabatt|skonto/i

const POSITION_START = /^\s*(?:\d{1,3}(?:\.\d{3})?)\s+\S/
const STOP = /übertrag|uebertrag|seite\s*:|^\s*[A-Z](?:\s[A-Z]){4,}/i

/**
 * Positions as blocks: a position starts with its number and runs until the next one; its text may
 * span several lines and its amount stands on the last („028 14,50 h Stundensatz …“ … „928,00“).
 * Whether it is labour is decided by its first line, so a list of work done does not turn material
 * into labour. Without numbered positions every line is its own position.
 */
function labourBlocks(lines: readonly string[]): LabourPosition[] {
  const blocks: string[][] = []
  for (const line of lines) {
    if (POSITION_START.test(line) && !SUMMARY.test(line)) blocks.push([line])
    else if (SUMMARY.test(line) || STOP.test(line)) blocks.push([])
    else blocks.at(-1)?.push(line)
  }
  const numbered = blocks.filter((b) => b.length > 0)
  const units = numbered.length > 0 ? numbered : lines.map((l) => [l])
  const positions: LabourPosition[] = []
  for (const block of units) {
    const heading = block[0]!
    if (!LABOUR.test(heading) || MATERIAL.test(heading) || SUMMARY.test(heading)) continue
    const amount = block.map(lastAmount).filter((a): a is number => a !== null).at(-1)
    if (amount !== undefined && amount > 0) positions.push({ text: heading.replace(/\s{2,}/g, ' ').trim(), netEur: amount })
  }
  return positions
}

const TOTAL_WITH_VAT = /(?:gesamt-?betrag|rechnungsbetrag|endsumme|gesamtsumme)\b.*\binkl/i
const TOTAL = /gesamt-?betrag|rechnungsbetrag|endsumme|gesamtsumme/i
const NET = /netto-?summe|nettosumme|gesamt\s*netto|summe\s*netto|\(netto\)/i

function statedLabour(text: string): number | null {
  const flat = text.replace(/\s+/g, ' ')
  // OCR may drop the decimal comma („1.234 56 €“).
  const amount = String.raw`(\d{1,3}(?:\.\d{3})*[,\s]\d{2})`
  const before = new RegExp(`${amount}\\s*€?\\s*(?:inkl\\.?[^€]{0,30}?)?\\s*(?:lohnkosten|lohnanteil|arbeitskosten|arbeitslohn)`, 'i').exec(flat)
  const after = new RegExp(`(?:lohnkosten|lohnanteil|arbeitskosten|arbeitslohn)[^\\d]{0,40}${amount}`, 'i').exec(flat)
  const hit = before ?? after
  return hit?.[1] ? Math.round(euros(hit[1].replace(/\s(\d{2})$/, ',$1'))) : null
}

export function parseCraftsmanInvoice(text: string): CraftsmanInvoiceRead {
  const lines = (text ?? '').split(/\r?\n/)
  // A sentence about the labour share („Rechnungsbetrag von … sind … Lohnkosten“) is no total line.
  const totals = lines.filter((l) => !/lohn|arbeitskosten/i.test(l))
  const totalLine = totals.filter((l) => TOTAL_WITH_VAT.test(l)).at(-1) ?? totals.filter((l) => TOTAL.test(l) && !NET.test(l)).at(-1)
  const total = totalLine ? lastAmount(totalLine) : null
  const netLine = lines.filter((l) => NET.test(l)).at(-1) ?? (lines.some((l) => TOTAL_WITH_VAT.test(l)) ? lines.find((l) => TOTAL.test(l) && !TOTAL_WITH_VAT.test(l)) : undefined)
  const net = netLine ? lastAmount(netLine) : null
  const printedRate = /(\d{1,2})[,.]00\s*%/.exec(lines.filter((l) => /ust|mwst|mehrwert/i.test(l) && !/\b0[,.]00\s*%/.test(l)).join(' '))
  const vatRate =
    total !== null && net !== null && net > 0
      ? Math.max(0, Math.round((total / net - 1) * 100) / 100)
      : printedRate?.[1]
        ? Number(printedRate[1]) / 100
        : null

  const labourPositions = labourBlocks(lines)

  const stated = statedLabour(text ?? '')
  // A discount on the whole invoice („abzgl. 2,00 % Rabatt“) lowers the labour as well.
  const discount = /(\d{1,2})(?:[,.]\d{1,2})?\s*%\s*(?:rabatt|nachlass)/i.exec(text ?? '')?.[1] ?? /(?:rabatt|nachlass)[^%\n]{0,20}?(\d{1,2})(?:[,.]\d{1,2})?\s*%/i.exec(text ?? '')?.[1]
  const afterDiscount = 1 - (discount ? Number(discount) / 100 : 0)
  const fromPositions =
    labourPositions.length > 0 ? Math.round(labourPositions.reduce((s, p) => s + p.netEur, 0) * afterDiscount * (1 + (vatRate ?? 0.19))) : null
  const labourEur = stated ?? fromPositions
  const dateYear = /(?:vom|datum)\s*:?\s*\d{1,2}\.\d{1,2}\.(20\d{2})/i.exec(text ?? '')?.[1] ?? /\b\d{2}\.\d{2}\.(20\d{2})\b/.exec(text ?? '')?.[1]
  return {
    labourEur,
    invoiceTotalEur: total !== null ? Math.round(total) : null,
    source: stated !== null ? 'stated' : fromPositions !== null ? 'positions' : null,
    vatRate,
    labourPositions,
    taxYear: dateYear ? Number(dateYear) : null,
    subsidyHint: /\bBAFA\b|\bKfW\b|förder|gefördert|zuschuss/i.test(text ?? ''),
    notAnInvoice: /auftragsbest|\bangebot\b|kostenvoranschlag/i.test(text ?? '') && !/\brechnung\b/i.test(text ?? ''),
  }
}

/** A craftsman's invoice: labour stated, or a labour position with an amount and an invoice total. */
export function looksLikeCraftsmanInvoice(text: string): boolean {
  if (!text) return false
  const read = parseCraftsmanInvoice(text)
  return read.labourEur !== null && read.invoiceTotalEur !== null
}
