import { PDFArray, type PDFDocument, type PDFRawStream, decodePDFRawStream } from 'pdf-lib'

// pdf-lib writes drawn text as hex strings. Every page of the SteuerEule summary carries the brand in its
// header or footer; a Vordruck page carries the form's own content and the values, never that word.
const BRAND = Buffer.from('SteuerEule', 'latin1').toString('hex').toUpperCase()

function drawnOn(pdf: PDFDocument, index: number): string {
  const contents = pdf.getPage(index).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref) as PDFRawStream) : [contents as PDFRawStream]
  return streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).join('')
}

/** Whether the page at `index` is one of the summary's (true) or a Vordruck page (false). */
export function isSummaryPage(pdf: PDFDocument, index: number): boolean {
  return drawnOn(pdf, index).includes(BRAND)
}

/** The summary pages that lead a printout. */
export function summaryPageCount(pdf: PDFDocument): number {
  return pdf.getPageIndices().filter((index) => isSummaryPage(pdf, index)).length
}

/** The pages of the official Vordrucke in a printout, without the summary in front of them. */
export function formPageCount(pdf: PDFDocument): number {
  return pdf.getPageCount() - summaryPageCount(pdf)
}
