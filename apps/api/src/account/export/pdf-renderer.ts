export const PDF_RENDERER = Symbol('PDF_RENDERER')

/** Renders the export report to PDF; the engine behind it is swappable. */
export interface PdfRenderer {
  renderPdf(html: string): Promise<Buffer>
}
