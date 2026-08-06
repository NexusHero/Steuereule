import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@steuereule/ui'
import qrcode from 'qrcode-generator'
import { QrMark } from './QrMark'

function renderQr(value: string) {
  return render(
    <ThemeProvider mode="light">
      <QrMark value={value} accessibilityLabel="QR-Code zum Anmelden mit dem Handy" />
    </ThemeProvider>,
  )
}

// Real production shape and size — `LoginScreen.tsx`'s own call site
// (`<QrMark value={state.verificationUriComplete} size={144} … brandMark />`), not an arbitrary
// value chosen for the test's own convenience.
const PRODUCTION_URL = 'http://localhost:8081/device?user_code=K7QX-9F2M'
const PRODUCTION_SIZE = 144

function pxNumber(value: string): number {
  const n = Number.parseFloat(value.replace('px', ''))
  if (Number.isNaN(n)) throw new Error(`pxNumber: could not parse a px length from "${value}"`)
  return n
}

/**
 * #298 F5 — decided by the stakeholder and Musti (comment `5200729110` on the PR): the QR's
 * scannability budget is proven by a unit test measured against the real matrix `qrcode-generator`
 * (the exact encoder `QrMark` itself calls, no reimplementation) and the real rendered geometry
 * (read back off the DOM via `qr-mark-quiet-zone`/`qr-mark-brand-mark`'s own `testID`s, never a
 * constant copied into this file) — deliberately NOT a decoder. Musti's own ruling on why: a
 * decoder readback of a rendered screenshot would have decoded the *previous*, too-large 7.4%
 * mark cleanly too (Kaan's own ZBar run on that exact geometry, `quality=1`) — a test built on
 * that would have stayed green through the exact defect it exists to catch. Geometry is what
 * actually bounds the error-correction budget spent; a decode of a perfect, angle-free screenshot
 * proves nothing about that budget (see `QrMark.tsx`'s own F11(a) correction).
 *
 * Both assertions below are mutation-verified (see the PR's own record) — bumping the brand mark
 * back toward the old, DS-reference-inherited fraction turns the coverage assertion red, and
 * zeroing the quiet zone's module count turns the margin assertion red.
 */
describe('QrMark geometry (#298 F5 — real matrix + real rendered geometry, no decoder)', () => {
  it('keeps the brand mark under a real module-coverage ceiling, measured from the actual encoder and the actual rendered box', () => {
    render(
      <ThemeProvider mode="light">
        <QrMark value={PRODUCTION_URL} size={PRODUCTION_SIZE} brandMark accessibilityLabel="QR-Code zum Anmelden mit dem Handy" />
      </ThemeProvider>,
    )

    // The exact encoder + level QrMark.tsx itself calls (`qrcode(0, 'M')`) — not a re-implemented
    // QR algorithm, the same real matrix production code renders from.
    const qr = qrcode(0, 'M')
    qr.addData(PRODUCTION_URL)
    qr.make()
    const moduleCount = qr.getModuleCount()
    const cell = PRODUCTION_SIZE / moduleCount

    // The brand mark's own actual rendered box — read off the DOM, not recomputed from a
    // fraction duplicated into this file (that would only prove the test agrees with itself).
    const brandMarkEl = screen.getByTestId('qr-mark-brand-mark')
    const markSize = pxNumber(brandMarkEl.style.width)
    const markInset = pxNumber(brandMarkEl.style.top)
    expect(pxNumber(brandMarkEl.style.left)).toBeCloseTo(markInset, 5)

    // Same method the doc comment on `QrMark`'s `brandMark` prop describes, and the same one
    // Musti's own review measurements used: count every module cell (dark or light — the doc's
    // own "1089", not just the dark ones) whose square overlaps the mark's square AT ALL, since a
    // partially-covered module is still lost from the scanner's point of view.
    let coveredModules = 0
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        const x0 = col * cell
        const x1 = x0 + cell
        const y0 = row * cell
        const y1 = y0 + cell
        const overlaps = x0 < markInset + markSize && x1 > markInset && y0 < markInset + markSize && y1 > markInset
        if (overlaps) coveredModules += 1
      }
    }
    const totalModules = moduleCount * moduleCount
    const coverageFraction = coveredModules / totalModules

    // Sanity floor — a mark that reserves no real area at all would trivially "pass" a
    // ceiling-only check.
    expect(coveredModules).toBeGreaterThan(0)
    // The actual ceiling: measured today at 25/1089 ≈ 2.3% (F5, re-confirmed independently by
    // Musti's second pass from this component's own rendered geometry). 5% is not that number —
    // it's real headroom for legitimate future tuning, set well clear of the old, DS-reference-
    // inherited 7.4% this PR moved away from, so a regression back toward that value is exactly
    // what turns this red, not routine noise.
    expect(coverageFraction).toBeLessThan(0.05)
  })

  it('reserves a real ISO/IEC 18004 quiet zone (>= 4 modules), measured from the actual rendered padding', () => {
    render(
      <ThemeProvider mode="light">
        <QrMark value={PRODUCTION_URL} size={PRODUCTION_SIZE} brandMark accessibilityLabel="QR-Code zum Anmelden mit dem Handy" />
      </ThemeProvider>,
    )

    const qr = qrcode(0, 'M')
    qr.addData(PRODUCTION_URL)
    qr.make()
    const moduleCount = qr.getModuleCount()
    const cell = PRODUCTION_SIZE / moduleCount

    // The real rendered padding — react-native-web serialises RN's single-number `padding` into
    // all four longhand sides; reading `paddingTop` alone is enough since `QrMark` only ever sets
    // the shorthand (all four sides equal).
    const quietZoneEl = screen.getByTestId('qr-mark-quiet-zone')
    const quietZonePx = pxNumber(quietZoneEl.style.paddingTop)
    const quietZoneModules = quietZonePx / cell

    // ISO/IEC 18004 §5.3.2's own minimum — not this component's own constant echoed back, this
    // is the standard's number, independent of whatever `QrMark.tsx` currently sets it to.
    expect(quietZoneModules).toBeGreaterThanOrEqual(4 - 1e-6)
  })
})

describe('QrMark', () => {
  it('renders an accessible image for the given value', () => {
    renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    expect(screen.getByLabelText('QR-Code zum Anmelden mit dem Handy')).toBeTruthy()
  })

  it('encodes different values into different module patterns', () => {
    const { unmount: unmountA } = renderQr('https://steuereule.example/geraet?user_code=AAAA-1111')
    const cellsA = screen.getByTestId('qr-mark').children.length
    unmountA()

    const { unmount: unmountB } = renderQr(
      'https://steuereule.example/geraet?user_code=AAAA-1111&extra=a-genuinely-different-and-much-longer-payload-to-force-a-different-qr-version',
    )
    const cellsB = screen.getByTestId('qr-mark').children.length
    unmountB()

    // Not asserting exact counts (that's the encoder's own concern, not this component's) — just
    // that two different inputs are not silently rendering the same, hard-coded pattern.
    expect(cellsA).not.toBe(cellsB)
  })

  it('renders the same value deterministically across mounts', () => {
    const { unmount: unmountFirst } = renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    const cellsFirst = screen.getByTestId('qr-mark').children.length
    unmountFirst()

    renderQr('https://steuereule.example/geraet?user_code=K7QX-9F2M')
    const cellsSecond = screen.getByTestId('qr-mark').children.length
    expect(cellsFirst).toBe(cellsSecond)
  })
})
