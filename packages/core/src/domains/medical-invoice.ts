/**
 * Reads a doctor's, dentist's or other medical invoice for the Krankheitskosten (§ 33 EStG), so several
 * invoices add up and one invoice uploaded twice counts once. A cosmetic operation without a medical
 * reason is no extraordinary burden: it is recognised so the app can say so and record nothing.
 */

export interface MedicalInvoiceRead {
  /** What the patient paid, in whole euros: the own share after a printed refund, else the total. */
  readonly totalEur: number | null
  readonly taxYear: number | null
  readonly invoiceDate: string | null
  /** Cosmetic treatment (Schönheitsoperation, Botox …): never counted. */
  readonly cosmetic: boolean
  /** Issuer, invoice number or date, and amount: recognises the same invoice uploaded again. */
  readonly ref: string
}

const MEDICAL =
  /zahnarzt|zahnärzt|arztpraxis|ärztlich|\bpraxis\b|klinik|krankenhaus|physiotherap|heilpraktiker|kieferorthop|optiker|brillengl|hörgerät|\bgoä\b|\bgoz\b|patient(?:in)?:|ästheti|schönheits/i
const NOT_MEDICAL = /zuwendungsbest|bestätigung über geld|handwerker|lohnsteuerbescheinigung|lohnausweis/i
const COSMETIC =
  /schönheitsop|ästhetische[rn]? (?:chirurgie|behandlung|lidstraffung|korrektur)|kosmetische[rn]? (?:behandlung|eingriff|operation)|botox|faltenunterspritz|fettabsaugung|liposuktion|brustvergrößer|keine medizinische indikation/i

/** „1.700,00 EUR“, „450,00 €“: whole euros, the thousands separator understood. */
const EURO = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?\s*(?:€|eur\b|euro\b)/i
const OWN_SHARE = /eigenanteil|selbst zu zahlen|zu zahlender betrag/i
const TOTAL = /rechnungsbetrag|gesamtbetrag|endbetrag|summe|gesamt|zu zahlen|betrag/i

function euros(line: string): number | null {
  const m = EURO.exec(line)
  if (!m) return null
  return Math.round(Number(m[1]!.replace(/\./g, '')) + Number(m[2] ?? '0') / 100)
}

function amountOn(lines: readonly string[], label: RegExp): number | null {
  for (const line of lines) if (label.test(line)) {
    const value = euros(line)
    if (value !== null) return value
  }
  return null
}

export function looksLikeMedicalInvoice(text: string): boolean {
  return MEDICAL.test(text ?? '') && !NOT_MEDICAL.test(text ?? '')
}

export function parseMedicalInvoice(text: string): MedicalInvoiceRead {
  const lines = (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const totalEur = amountOn(lines, OWN_SHARE) ?? amountOn(lines, TOTAL) ?? lines.map(euros).find((v) => v !== null) ?? null
  const date = /(\d{2})\.(\d{2})\.(20\d{2})/.exec(text ?? '')
  const number = /(?:rechnung(?:s-?nr\.?|snummer)?|nr\.)\s*:?\s*([A-Z0-9][A-Z0-9/-]{3,})/i.exec(text ?? '')
  const issuer = (lines[0] ?? '').toLowerCase().replace(/\s+/g, ' ')
  return {
    totalEur,
    taxYear: date ? Number(date[3]) : null,
    invoiceDate: date ? `${date[1]}.${date[2]}.${date[3]}` : null,
    cosmetic: COSMETIC.test(text ?? ''),
    ref: `${issuer}|${number?.[1] ?? date?.[0] ?? ''}|${totalEur ?? ''}`,
  }
}
