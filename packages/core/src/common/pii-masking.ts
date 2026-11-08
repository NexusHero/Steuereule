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
  for (const rawName of knownNames) {
    if (!rawName) continue
    const parts = rawName
      .trim()
      .split(/[\s-]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
    for (const part of parts) {
      const pattern = new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi')
      scrubbed = scrubbed.replace(pattern, '[MANDANT]')
    }
  }

  return scrubbed
}

