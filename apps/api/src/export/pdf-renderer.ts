// The PDF renderer seam (ADR-0013 §7): produces a German-language PDF-Bericht from
// the same assembled export data that the JSON representation ships. Backed by the
// Chromium already present via Playwright (no new heavy dependency), swappable behind
// this seam so a lighter renderer can slot in later if needed.
//
// LoggingPdfRenderer is the dev/test stub — produces a placeholder PDF without
// needing a running Chromium. The real PlaywrightPdfRenderer is wired in production.

import type { ExportData } from './export.repository.js'

export const PDF_RENDERER = Symbol('PDF_RENDERER')

export interface PdfRenderer {
  /** Renders the export data as a German-language PDF buffer. */
  renderPdf(data: ExportData, exportedAt: Date): Promise<Buffer>
}
