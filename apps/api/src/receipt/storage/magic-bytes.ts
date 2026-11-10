import { InvalidInputError } from '../../common/domain-error.js'

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_RECEIPT_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
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

  throw new InvalidInputError(
    'RECEIPT_FILE_UNSUPPORTED',
    'Unzulässiges Dateiformat. Erlaubt sind ausschließlich echte PDF-, JPEG-, PNG- oder WebP-Dateien.',
  )
}
