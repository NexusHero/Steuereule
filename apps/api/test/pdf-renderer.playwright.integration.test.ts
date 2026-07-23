// Dedicated real-Chromium test for PlaywrightPdfRenderer (ADR-0013 §7), independent of
// the Nest/HTTP wiring — proves the seam's *implementation* actually launches a real
// headless browser and renders real PDF bytes from arbitrary self-contained HTML.
// Named *.integration.test.ts (not *.test.ts) so it's routed to the Chromium-requiring
// tier (vitest.integration.config.ts) — the plain no-DB `test` job must never need a
// real browser (see build-test-app.ts's comment on why FakePdfRenderer exists).
import { afterAll, describe, expect, it } from 'vitest'
import { PlaywrightPdfRenderer } from '../src/account/export/pdf-renderer.playwright.js'

describe('PlaywrightPdfRenderer — real Chromium', () => {
  const renderer = new PlaywrightPdfRenderer()

  afterAll(async () => {
    await renderer.onModuleDestroy()
  })

  it('renders a self-contained HTML document to real PDF bytes', async () => {
    await renderer.onModuleInit()

    const pdf = await renderer.renderPdf('<html><body><h1>SteuerEule Test-Bericht</h1></body></html>')

    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(500)
  })

  it('renders two calls independently — no state leaks between pages', async () => {
    const first = await renderer.renderPdf('<html><body>First document</body></html>')
    const second = await renderer.renderPdf('<html><body>Second, unrelated document</body></html>')

    expect(first.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(second.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    // Genuinely different content renders to genuinely different byte lengths/content —
    // not a cached/stubbed response reused across calls.
    expect(Buffer.compare(first, second)).not.toBe(0)
  })

  it('lazily launches Chromium on first render if onModuleInit was never called (dev-box-without-browser-yet fallback)', async () => {
    const lazyRenderer = new PlaywrightPdfRenderer()
    try {
      const pdf = await lazyRenderer.renderPdf('<html><body>Lazy launch</body></html>')
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    } finally {
      await lazyRenderer.onModuleDestroy()
    }
  })
})
