import { InvalidInputError } from '../../common/domain-error.js'

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_RECEIPT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  // An E-Rechnung (XRechnung, ADR-0101 §22): kept in the format it was received in (§ 14 Abs. 1 UStG, GoBD).
  'application/xml',
] as const

export type AllowedReceiptMimeType = (typeof ALLOWED_RECEIPT_FILE_MIME_TYPES)[number]

/**
 * Inspects file magic bytes (never trusting client Content-Type headers or file extensions)
 * and rejects empty, oversized (> 10 MB), or disallowed files (HTML, SVG, scripts, executables).
 */
export function detectAllowedReceiptMimeType(buffer: Buffer): AllowedReceiptMimeType {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new InvalidInputError('RECEIPT_FILE_EMPTY', 'Die hochgeladene Datei ist leer.')
  }
  if (buffer.length > MAX_RECEIPT_FILE_BYTES) {
    throw new InvalidInputError(
      'RECEIPT_FILE_TOO_LARGE',
      'Die Datei ist größer als das erlaubte Maximum von 10 MB.',
    )
  }

  // %PDF-
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf'
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (isEInvoiceXml(buffer)) return 'application/xml'

  throw new InvalidInputError(
    'RECEIPT_FILE_UNSUPPORTED',
    'Unzulässiges Dateiformat. Erlaubt sind ausschließlich echte PDF-, JPEG-, PNG- oder WebP-Dateien und E-Rechnungen (XML).',
  )
}

/** The root elements of an E-Rechnung: UBL Invoice and CreditNote (XRechnung), UN/CEFACT CII (XRechnung, ZUGFeRD). */
const E_INVOICE_ROOT = /^<(?:[A-Za-z][\w.-]*:)?(Invoice|CreditNote|CrossIndustryInvoice)[\s>]/

/**
 * Only an E-Rechnung passes as XML: no DTD or entity declaration (XXE, entity expansion), no processing
 * instruction other than the XML declaration, and an invoice as the root element. Anything else that
 * starts with `<` (HTML, SVG, XHTML) stays refused.
 */
export function isEInvoiceXml(buffer: Buffer): boolean {
  let text = buffer.subarray(0, Math.min(buffer.length, 64 * 1024)).toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  text = text.trimStart()
  if (!text.startsWith('<')) return false
  const whole = buffer.toString('utf8')
  if (/<!DOCTYPE|<!ENTITY/i.test(whole)) return false
  let rest = text
  if (rest.startsWith('<?xml')) {
    const end = rest.indexOf('?>')
    if (end < 0) return false
    rest = rest.slice(end + 2).trimStart()
  }
  // Comments before the root are allowed; another processing instruction (a stylesheet) is not.
  while (rest.startsWith('<!--')) {
    const end = rest.indexOf('-->')
    if (end < 0) return false
    rest = rest.slice(end + 3).trimStart()
  }
  return E_INVOICE_ROOT.test(rest)
}
