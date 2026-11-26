// Reads a QR symbol back out of a screenshot and compares its payload with the one the page is expected to carry
// (#302). This is a PAYLOAD proof: the rendered symbol is a real QR code and it encodes the right URL. It decodes an
// ideal screenshot, so it says nothing about the error-correction margin under a real camera, glare or angle; the
// geometry (module coverage, quiet zone) is gated separately in apps/mobile-web's QrMark unit test.
import jsQR from 'jsqr'
import { PNG } from 'pngjs'

/** The decoded payload of the QR code in a PNG buffer, or null when no symbol can be read. */
export function decodeQrPng(pngBuffer) {
  const { data, width, height } = PNG.sync.read(pngBuffer)
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height)?.data ?? null
}

/** `{ ok, decoded, reason }`: ok only when a symbol is readable AND its payload equals `expectedPayload` exactly. */
export function compareQrPayload(pngBuffer, expectedPayload) {
  const decoded = decodeQrPng(pngBuffer)
  if (decoded === null) return { ok: false, decoded, reason: 'no QR symbol could be decoded from the screenshot' }
  if (decoded !== expectedPayload) {
    return { ok: false, decoded, reason: `the QR encodes ${JSON.stringify(decoded)}, expected ${JSON.stringify(expectedPayload)}` }
  }
  return { ok: true, decoded, reason: '' }
}
