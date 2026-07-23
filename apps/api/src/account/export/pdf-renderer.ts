// The engine-swappable seam ADR-0013 §7 mandates: AccountExportService depends only on
// this interface, never on Playwright directly, so a lighter renderer can slot in
// later (the "Chromium in the runtime image" infra follow-up) with zero
// service/controller change. Mirrors auth/email-sender.ts's seam shape.
export const PDF_RENDERER = Symbol('PDF_RENDERER')

export interface PdfRenderer {
  /** Renders a self-contained HTML document (no external network fetch) to a PDF buffer. */
  renderPdf(html: string): Promise<Buffer>
}
