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
