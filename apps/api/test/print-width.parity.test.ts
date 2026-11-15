// ADR-0090: the core's Helvetica widths (for masks that stop a too-long text on entry) must be the
// ones the printout measures with, and the childcare box width the one on the forms.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { CHILDCARE_PROVIDER_WIDTH_PT, PRINT_FONT_SIZE_PT, printedWidthPt } from '@steuereule/core'

describe('print width parity with the printout (ADR-0090)', () => {
  it('measures like pdf-lib’s Helvetica, never narrower (it leaves out kerning)', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica)
    for (const text of ['Kindergarten Gemeinde Musterdorf, Hauptstr. 1', 'Kita „Rübezahl“ – Öhringen, Weg 12 · 74613', 'ÄÖÜäöüß é € § @ 0123456789']) {
      const expected = font.widthOfTextAtSize(text.replace('·', '.'), PRINT_FONT_SIZE_PT)
      const measured = printedWidthPt(text.replace('·', '.'))
      expect(measured).toBeGreaterThanOrEqual(expected)
      expect(measured - expected).toBeLessThan(expected * 0.02)
    }
  })

  it('knows the childcare box of the 2024 and 2025 forms', () => {
    for (const year of [2024, 2025]) {
      const set = JSON.parse(readFileSync(new URL(`../src/printout/felder-${year}.json`, import.meta.url), 'utf8')) as { felder: { id: string; kasten: { breite: number } }[] }
      const box = set.felder.find((f) => f.id === 'anlKind.z67Text')
      expect(box?.kasten.breite).toBeDefined()
      // Never wider than the narrowest year's box.
      expect(CHILDCARE_PROVIDER_WIDTH_PT).toBeLessThanOrEqual((box?.kasten.breite ?? 0) - 3)
    }
  })
})
