// In-memory fake PDF renderer — records calls and returns a deterministic placeholder
// buffer so the export service's PDF branch can be tested without Chromium.
import type { ExportData } from '../../src/export/export.repository.js'
import type { PdfRenderer } from '../../src/export/pdf-renderer.js'

export class FakePdfRenderer implements PdfRenderer {
  private readonly calls: Array<{ data: ExportData; exportedAt: Date }> = []

  async renderPdf(data: ExportData, exportedAt: Date): Promise<Buffer> {
    this.calls.push({ data, exportedAt })
    return Buffer.from(`FAKE-PDF-for-${data.account.name}`)
  }

  callCount(): number {
    return this.calls.length
  }

  lastCall(): { data: ExportData; exportedAt: Date } | undefined {
    return this.calls[this.calls.length - 1]
  }
}
