// A trivial in-memory PdfRenderer — proves the PdfRenderer *seam* is exercised
// (AccountExportService calls it with the built HTML) without ever launching a real
// browser in the no-DB unit test job (ADR-0004: that job must never need Chromium).
// The real engine (PlaywrightPdfRenderer) has its own dedicated test — see
// test/pdf-renderer.playwright.test.ts.
import type { PdfRenderer } from '../../src/account/export/pdf-renderer.js'

export class FakePdfRenderer implements PdfRenderer {
  public lastHtml: string | undefined

  renderPdf(html: string): Promise<Buffer> {
    this.lastHtml = html
    return Promise.resolve(Buffer.from(`%PDF-FAKE\n${html.length} bytes of source HTML\n`))
  }
}
