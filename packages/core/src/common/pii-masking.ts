/**
 * Masking of personally identifiable information (PII) for AI assistant access.
 * Traces to: ADR-0052 §8 (Personenbezogene Daten: schreiben ja, lesen maskiert).
 */

export function maskTaxId(taxId: string | null | undefined): string | null {
  if (!taxId) return null
  const clean = taxId.replace(/\s+/g, '')
  if (clean.length <= 2) return '*'.repeat(clean.length)
  if (clean.length < 6) return `${clean[0]}${'*'.repeat(clean.length - 2)}${clean[clean.length - 1]}`
  const prefix = clean.slice(0, 2)
  const suffix = clean.slice(-2)
  const maskedLength = clean.length - 4
  return `${prefix}${'*'.repeat(maskedLength)}${suffix}`
}

export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null
  const clean = iban.replace(/\s+/g, '').toUpperCase()
  if (clean.length <= 4) return '*'.repeat(clean.length)
  const country = clean.slice(0, 2)
  const suffix = clean.slice(-2)
  const maskedTotal = clean.length - 4

  // Group into standard 4-char chunks
  const fullMasked = `${country}${'*'.repeat(maskedTotal)}${suffix}`
  const chunks: string[] = []
  for (let i = 0; i < fullMasked.length; i += 4) {
    chunks.push(fullMasked.slice(i, i + 4))
  }
  return chunks.join(' ')
}

export function maskStreet(street: string | null | undefined): string | null {
  if (!street) return null
  const trimmed = street.trim()
  if (trimmed.length === 0) return null
  return `${trimmed[0]}***`
}

export function maskHouseNumber(houseNumber: string | null | undefined): string | null {
  if (!houseNumber) return null
  return '***'
}

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null
  const parts = name.trim().split(/\s+/)
  return parts
    .map((part) => (part.length > 0 ? `${part[0]}***` : ''))
    .filter(Boolean)
    .join(' ')
}

const LEGAL_FORM_REGEX = /\b(AG|GmbH|UG|KG|OHG|SE|e\.V\.|Corp|Inc|LLC|Ltd)\b/i

export function maskEmployer(employer: string | null | undefined): string | null {
  if (!employer) return null
  const trimmed = employer.trim()
  if (trimmed.length === 0) return null

  const match = trimmed.match(LEGAL_FORM_REGEX)
  if (match && match.index !== undefined) {
    const legalForm = match[0]
    return `${trimmed[0]}*** ${legalForm}`
  }
  return `${trimmed[0]}***`
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) {
    const parts = trimmed.split(/\s+/)
    return `${parts[0]} ***`
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length > 1) {
    return `${parts[0]} ***`
  }
  return `${trimmed.slice(0, 4)} ***`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const IBAN_TEXT_REGEX = /\b[A-Z]{2}\d{2}(?:[\s.-]?[A-Z0-9]{4}){3,7}(?:[\s.-]?[A-Z0-9]{1,4})?\b/gi
const STEUER_ID_TEXT_REGEX =
  /\b\d{2}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\b|\b\d{3}[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{2}\b|\b\d{11}\b/g
const STEUERNR_TEXT_REGEX = /\b\d{2,5}\/\d{3,4}\/\d{4,5}\b/g
const EMAIL_TEXT_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const PHONE_TEXT_REGEX = /(?:\+(?:49|41|43)[\s/-]?\d{2,4}|0\d{2,4})[\s/-]?\d{3,4}(?:[\s/-]?\d{2,5})?\b/g

/**
 * Scrubs free-text user chat messages before sending them to an external LLM.
 * Replaces known profile names, 11-digit tax IDs, tax numbers, IBANs, emails, and phone numbers.
 */
export function scrubUserMessagePii(
  text: string,
  knownNames: readonly string[] = [],
): string {
  if (!text) return ''

  let scrubbed = text

  // 1. Replace structured PII patterns first (so emails like markus.brenner@firma.ch are
  // scrubbed as a complete [KONTAKT-GESCHÜTZT] unit rather than split by name replacement).
  scrubbed = scrubbed.replace(IBAN_TEXT_REGEX, '[IBAN-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STEUER_ID_TEXT_REGEX, '[STEUER-ID-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STEUERNR_TEXT_REGEX, '[STEUERNR-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMAIL_TEXT_REGEX, '[KONTAKT-GESCHÜTZT]')
  scrubbed = scrubbed.replace(PHONE_TEXT_REGEX, '[KONTAKT-GESCHÜTZT]')

  // 2. Replace known names from the user's tax profile (first/last names, partner, children)
  return replaceNamesWith(scrubbed, knownNames, '[MANDANT]')
}

/**
 * Replaces every part of the given names (first and last name, each part of a double name) with
 * a stand-in, as a whole word: „Büsra“ and „Ümit“ alike, never inside a longer word.
 */
export function replaceNamesWith(text: string, names: readonly string[], replacement: string): string {
  let replaced = text
  for (const rawName of names) {
    if (!rawName) continue
    const parts = rawName
      .trim()
      .split(/[\s-]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
    for (const part of parts) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(part)}(?![\\p{L}\\p{N}_])`, 'giu')
      replaced = replaced.replace(pattern, replacement)
    }
  }
  return replaced
}

const ETIN_TEXT_REGEX = /\beTIN\s*[:-]?\s*[A-Z0-9\s-]{8,20}|\b[A-Z]{6}[0-9]{2}[A-Z0-9]{6}\b/gi
const TRANSFERTICKET_REGEX = /\bTransferticket\s*[:-]?\s*[A-Za-z0-9_-]{6,}/gi
const SVNR_TEXT_REGEX = /\b\d{2}[\s.-]?\d{6}[\s.-]?[A-Z][\s.-]?\d{3}\b/g
const LABELED_PII_LINE_REGEX =
  /^\s*(?:Arbeitgeber(?:\s*\([^)]*\))?|Arbeitnehmer(?:in)?|Name(?:,?\s*Vorname)?|Vorname|Nachname|Familienname|Anschrift|Adresse|Straße|Strasse|Geburtsdatum|geb\.?\s*am|Identifikationsnummer|IdNr|Steuer-?ID|Steueridentifikationsnummer|Steuernummer|Transferticket|Personal-?Nr\.?|Mandanten-?Nr\.?|Arbeitnehmernummer|Sozialversicherungsnummer|Versicherungsnummer|Finanzamt|AGS|Bundesland|Steuerklasse(?:\s*\/?\s*Faktor)?|Zahl\s+der\s+Kinderfreibeträge|Kirchensteuermerkmal)\s*[:-]?\s+.*$/gim
const STREET_AND_NUMBER_REGEX =
  /\b[A-ZÄÖÜ][a-zäöüß-]{2,}(?:straße|strasse|str\.|weg|allee|platz|ring|gasse|damm|ufer)\s+\d{1,4}[a-zA-Z]?\b/gi
const DOB_VALUE_REGEX = /\b(?:geb\.?(?:\s*am)?|Geburtsdatum)\s*[:-]?\s*\d{1,2}\.\d{1,2}\.\d{2,4}\b/gi
const EMPLOYER_LINE_REGEX =
  /^(?!.*\b(?:Bruttoarbeitslohn|Lohnsteuer|Rentenversicherung|Krankenversicherung|Pflegeversicherung|Arbeitslosenversicherung)\b).*\b(?:GmbH|mbH|UG|OHG|KGaA|GmbH\s*&\s*Co\.?\s*KG|Co\.?\s*KG|AG|SE)\b.*$/gm
const LABELED_PLZ_LINE_REGEX = /^\s*(?:PLZ\s*\/?\s*Ort|D-\d{5}|DE-\d{5}|\d{5}\s+[A-ZÄÖÜ][a-zäöüß-]+(?:\s+[A-ZÄÖÜ][a-zäöüß-]+)?)\s*$/gm

/**
 * Scrubs uploaded/OCR document text (e.g. Lohnsteuerbescheinigung) before any external AI fallback.
 * Strips personal header lines, employer names, eTIN, Transferticket, SV numbers, addresses,
 * birthdates, Steuerklasse, plus all chat PII (Steuer-ID, Steuernummer, IBAN, contact, known names).
 */
export function scrubDocumentTextPii(
  text: string,
  knownNames: readonly string[] = [],
): string {
  if (!text) return ''

  let scrubbed = text
  scrubbed = scrubbed.replace(LABELED_PII_LINE_REGEX, '[PII-ZEILE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(ETIN_TEXT_REGEX, '[ETIN-GESCHÜTZT]')
  scrubbed = scrubbed.replace(TRANSFERTICKET_REGEX, '[TICKET-GESCHÜTZT]')
  scrubbed = scrubbed.replace(SVNR_TEXT_REGEX, '[SVNR-GESCHÜTZT]')
  scrubbed = scrubbed.replace(DOB_VALUE_REGEX, '[GEBURTSDATUM-GESCHÜTZT]')
  scrubbed = scrubbed.replace(STREET_AND_NUMBER_REGEX, '[ADRESSE-GESCHÜTZT]')
  scrubbed = scrubbed.replace(EMPLOYER_LINE_REGEX, '[ARBEITGEBER-GESCHÜTZT]')
  scrubbed = scrubbed.replace(LABELED_PLZ_LINE_REGEX, '[ORT-GESCHÜTZT]')

  return scrubUserMessagePii(scrubbed, knownNames)
}


