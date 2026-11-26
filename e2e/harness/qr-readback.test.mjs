// node --test e2e/harness/qr-readback.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PNG } from 'pngjs'
import { compareQrPayload, decodeQrPng } from './qr-readback.mjs'

// A real QR (qrcode-generator, level M, the generator the app uses) of this payload, rendered flat with a 4-module quiet zone.
const PAYLOAD = 'https://app.example.test/geraet?user_code=ABCD-EFGH'
const sample = () => readFileSync(new URL('./fixtures/qr-sample.png', import.meta.url))

/** Paints every pixel of a rectangle (fractions of the image) the light colour, i.e. erases modules. */
function erase(buffer, [x0, y0, x1, y1]) {
  const png = PNG.sync.read(buffer)
  for (let y = Math.floor(png.height * y0); y < png.height * y1; y++) {
    for (let x = Math.floor(png.width * x0); x < png.width * x1; x++) {
      const i = (y * png.width + x) * 4
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 250
    }
  }
  return PNG.sync.write(png)
}

test('the payload of an intact symbol is read back and matches', () => {
  assert.equal(decodeQrPng(sample()), PAYLOAD)
  assert.deepEqual(compareQrPayload(sample(), PAYLOAD), { ok: true, decoded: PAYLOAD, reason: '' })
})

test('control: a symbol with a destroyed finder pattern does not pass', () => {
  const result = compareQrPayload(erase(sample(), [0.1, 0.1, 0.35, 0.35]), PAYLOAD)
  assert.equal(result.ok, false)
})

test('control: a heavily damaged data area does not pass', () => {
  const result = compareQrPayload(erase(sample(), [0.2, 0.4, 0.8, 0.75]), PAYLOAD)
  assert.equal(result.ok, false)
})

test('control: a readable symbol with a different payload does not pass, and says what it read', () => {
  const result = compareQrPayload(sample(), 'https://app.example.test/geraet?user_code=WXYZ-0000')
  assert.equal(result.ok, false)
  assert.equal(result.decoded, PAYLOAD)
  assert.match(result.reason, /expected/)
})

test('a blank image is reported as unreadable', () => {
  const blank = new PNG({ width: 64, height: 64 })
  blank.data.fill(255)
  assert.deepEqual(compareQrPayload(PNG.sync.write(blank), PAYLOAD).decoded, null)
})
