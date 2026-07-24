// Dev/test stub for the PDF renderer seam (ADR-0013 §7).
// Produces a minimal placeholder PDF that records the export date and user name
// without requiring a running Chromium instance. The real PlaywrightPdfRenderer
// (or equivalent) is wired in production/staging; this stub keeps the module
// bootable and testable without that infra dependency.
import { Inject, Injectable } from '@nestjs/common'
import type { ExportData } from './export.repository.js'
import { PDF_RENDERER, type PdfRenderer } from './pdf-renderer.js'

/**
 * Minimal valid PDF (1.4) with a text stream — enough for dev/test round-trips
 * and for the acceptance test to verify `Content-Type: application/pdf` and
 * filename headers without needing Chromium.
 */
function buildPlaceholderPdf(data: ExportData, exportedAt: Date): Buffer {
  const dateStr = exportedAt.toISOString().slice(0, 10)
  const name = data.profile ? `${data.profile.firstName} ${data.profile.lastName}` : data.account.name
  const content = `SteuerEule Datenexport — ${dateStr}\nNutzer: ${name}\n\nDies ist ein Platzhalter-PDF. In Produktion wird dieser Bericht via Chromium gerendert.`

  // Minimal valid PDF structure (simplified):
  // %PDF-1.4 header, one page, one text stream, xref table, trailer.
  const lines = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    'endobj',
    `5 0 obj`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    'endobj',
  ]

  // Build stream content
  const streamLines = ['BT', '/F1 12 Tf', '50 800 Td']
  for (const line of content.split('\n')) {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    streamLines.push(`(${escaped}) Tj 0 -16 Td`)
  }
  streamLines.push('ET')
  const streamContent = streamLines.join('\n')

  lines.push('4 0 obj')
  lines.push(`<< /Length ${Buffer.byteLength(streamContent)} >>`)
  lines.push('stream')
  lines.push(streamContent)
  lines.push('endstream')
  lines.push('endobj')

  // Calculate offsets for xref
  const pdfBytes: Buffer[] = []
  const offsets: number[] = []
  let currentOffset = 0

  for (const line of lines) {
    const objIndex = parseInt(line)
    if (!isNaN(objIndex) && lines[lines.indexOf(line) + 1] === '0 obj') {
      offsets.push(currentOffset)
    }
    const b = Buffer.from(`${line}\n`, 'latin1')
    pdfBytes.push(b)
    currentOffset += b.length
  }

  // xref
  const xrefStart = currentOffset
  const xref = [
    'xref',
    `0 ${offsets.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${o.toString().padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${offsets.length + 1} /Root 1 0 R >>`,
    'startxref',
    `${xrefStart}`,
    '%%EOF',
  ]

  for (const line of xref) {
    pdfBytes.push(Buffer.from(`${line}\n`, 'latin1'))
  }

  return Buffer.concat(pdfBytes)
}

@Injectable()
export class LoggingPdfRenderer implements PdfRenderer {
  async renderPdf(data: ExportData, exportedAt: Date): Promise<Buffer> {
    const pdf = buildPlaceholderPdf(data, exportedAt)
    console.log(`[LoggingPdfRenderer] Rendered placeholder PDF (${pdf.length} bytes) for user ${data.account.name}`)
    return pdf
  }
}
