import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { PrintoutSummary, SummaryStep } from './printout-summary.js'

/**
 * The summary as A4 pages, drawn with the same library and the same standard font as the Vordrucke:
 * no browser, no font file, the same bytes for the same input. Layout only; the wording and every
 * figure come from `buildPrintoutSummary`.
 */
const PAGE = { width: 595.28, height: 841.89 }
const MARGIN = { x: 56, top: 60, bottom: 56 }
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN.x
const INK = rgb(0.06, 0.06, 0.08)
const QUIET = rgb(0.36, 0.36, 0.4)
const HAIRLINE = rgb(0.78, 0.78, 0.8)
const SIZE = { title: 16, headline: 13, section: 11.5, body: 9.5, small: 8 }
const LEADING = 1.38
const ZEILE_COLUMN = 34
const VALUE_COLUMN = 150
const COLUMN_GAP = 10

const TITLE = (year: number) => `Zusammenfassung zur Einkommensteuererklärung ${year}`
const NOT_PART = 'Nicht mit einreichen: Diese Seiten sind für deine Unterlagen und gehören nicht zur Erklärung.'
const STEPS_HEADING = 'So kommt das Ergebnis zustande'
const SECTIONS_HEADING = 'Was in den Vordrucken steht'
const NOTES_HEADING = 'Hinweise'

/** Every line of text the pages carry, in reading order (for tests and for search). */
export function summaryText(summary: PrintoutSummary): string {
  return [
    'SteuerEule',
    TITLE(summary.taxYear),
    NOT_PART,
    summary.persons.join(' und '),
    `Erstellt am ${summary.createdOn}`,
    summary.headline,
    ...(summary.steps.length > 0 ? [STEPS_HEADING] : []),
    ...summary.steps.flatMap((step) => [`${step.label} ${step.amount}`, ...(step.detail ? [step.detail] : [])]),
    NOTES_HEADING,
    ...summary.notes,
    ...(summary.sections.length > 0 ? [SECTIONS_HEADING] : []),
    ...summary.sections.flatMap((section) => [section.title, ...section.rows.map((row) => `${row.zeile ?? ''} ${row.label} ${row.value}`.trim())]),
  ].join('\n')
}

interface Fonts {
  readonly regular: PDFFont
  readonly bold: PDFFont
}

/** A cursor over the pages: text flows down, and a block that does not fit starts a new page. */
class Flow {
  private readonly pages: PDFPage[] = []
  private page!: PDFPage
  y = 0

  constructor(
    private readonly document: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.newPage()
  }

  newPage(): void {
    this.page = this.document.addPage([PAGE.width, PAGE.height])
    this.pages.push(this.page)
    this.y = PAGE.height - MARGIN.top
  }

  /** Makes sure `height` fits on the page, breaking before it otherwise. */
  need(height: number): void {
    if (this.y - height < MARGIN.bottom) this.newPage()
  }

  gap(height: number): void {
    this.y -= height
  }

  text(text: string, options: { size: number; bold?: boolean; quiet?: boolean; x?: number; width?: number; align?: 'left' | 'right' }): void {
    const font = options.bold ? this.fonts.bold : this.fonts.regular
    const x = options.x ?? MARGIN.x
    const width = options.width ?? CONTENT_WIDTH
    for (const line of wrap(font, encodable(font, text), options.size, width)) {
      this.need(options.size * LEADING)
      this.y -= options.size * LEADING
      const start = options.align === 'right' ? x + width - font.widthOfTextAtSize(line, options.size) : x
      this.page.drawText(line, { x: start, y: this.y, size: options.size, font, color: options.quiet ? QUIET : INK })
    }
  }

  /** Columns that share a row: each wraps in its own width, the row is as high as the tallest. */
  row(cells: readonly { text: string; x: number; width: number; bold?: boolean; quiet?: boolean; align?: 'left' | 'right' }[], size: number): void {
    const laidOut = cells.map((cell) => {
      const font = cell.bold ? this.fonts.bold : this.fonts.regular
      return { cell, font, lines: wrap(font, encodable(font, cell.text), size, cell.width) }
    })
    const height = Math.max(...laidOut.map((c) => c.lines.length)) * size * LEADING
    this.need(height)
    for (const { cell, font, lines } of laidOut) {
      lines.forEach((line, index) => {
        const baseline = this.y - (index + 1) * size * LEADING
        const start = cell.align === 'right' ? cell.x + cell.width - font.widthOfTextAtSize(line, size) : cell.x
        this.page.drawText(line, { x: start, y: baseline, size, font, color: cell.quiet ? QUIET : INK })
      })
    }
    this.y -= height
  }

  rule(): void {
    this.need(6)
    this.y -= 3
    this.page.drawLine({ start: { x: MARGIN.x, y: this.y }, end: { x: PAGE.width - MARGIN.x, y: this.y }, thickness: 0.5, color: HAIRLINE })
    this.y -= 3
  }

  /** The footer of every page, once the page count is known. */
  footers(text: (page: number, of: number) => string): void {
    this.pages.forEach((page, index) => {
      const line = encodable(this.fonts.regular, text(index + 1, this.pages.length))
      page.drawText(line, { x: MARGIN.x, y: MARGIN.bottom - 24, size: SIZE.small, font: this.fonts.regular, color: QUIET })
    })
  }
}

export async function renderSummary(summary: PrintoutSummary): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const fonts: Fonts = { regular: await document.embedFont(StandardFonts.Helvetica), bold: await document.embedFont(StandardFonts.HelveticaBold) }
  const flow = new Flow(document, fonts)

  flow.text('SteuerEule', { size: SIZE.body, bold: true })
  flow.text(TITLE(summary.taxYear), { size: SIZE.title, bold: true })
  flow.gap(4)
  flow.text(NOT_PART, { size: SIZE.body, quiet: true })
  flow.gap(10)
  if (summary.persons.length > 0) flow.text(summary.persons.join(' und '), { size: SIZE.body })
  flow.text(`Erstellt am ${summary.createdOn}`, { size: SIZE.body, quiet: true })
  flow.gap(14)
  flow.text(summary.headline, { size: SIZE.headline, bold: true })
  flow.gap(10)

  if (summary.steps.length > 0) {
    flow.text(STEPS_HEADING, { size: SIZE.section, bold: true })
    flow.gap(2)
    for (const step of summary.steps) drawStep(flow, step)
    flow.gap(12)
  }

  flow.text(NOTES_HEADING, { size: SIZE.section, bold: true })
  for (const note of summary.notes) flow.text(note, { size: SIZE.body, quiet: true })

  if (summary.sections.length > 0) {
    flow.newPage()
    flow.text(SECTIONS_HEADING, { size: SIZE.headline, bold: true })
    flow.text('Je Vordruck mit der Zeile, in der die Angabe steht.', { size: SIZE.body, quiet: true })
    for (const section of summary.sections) {
      flow.gap(12)
      // A heading never stands alone at the foot of a page.
      flow.need(SIZE.section * LEADING + 3 * SIZE.body * LEADING)
      flow.text(section.title, { size: SIZE.section, bold: true })
      flow.rule()
      if (section.rows.length === 0) flow.text('Keine Angaben.', { size: SIZE.body, quiet: true })
      for (const row of section.rows) {
        const labelX = MARGIN.x + ZEILE_COLUMN
        const valueX = PAGE.width - MARGIN.x - VALUE_COLUMN
        flow.row(
          [
            { text: row.zeile ?? '', x: MARGIN.x, width: ZEILE_COLUMN - COLUMN_GAP, quiet: true },
            { text: row.label, x: labelX, width: valueX - labelX - COLUMN_GAP },
            { text: row.value, x: valueX, width: VALUE_COLUMN, align: 'right' },
          ],
          SIZE.body,
        )
      }
    }
  }

  flow.footers((page, of) => `SteuerEule · ${TITLE(summary.taxYear)} · Seite ${page} von ${of} · kein amtlicher Vordruck`)
  document.setTitle(TITLE(summary.taxYear))
  document.setCreator('SteuerEule')
  document.setProducer('SteuerEule')
  return document.save()
}

/**
 * Puts the summary pages in front of the Vordrucke. The printout is loaded and extended in place, so
 * the fields of an editable printout stay what the renderer made them.
 */
export async function prependSummary(printout: Uint8Array, summary: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(printout)
  const source = await PDFDocument.load(summary)
  const pages = await document.copyPages(source, source.getPageIndices())
  pages.forEach((page, index) => document.insertPage(index, page))
  return document.save({ updateFieldAppearances: false })
}

const SIGN: Readonly<Record<SummaryStep['kind'], string>> = { plus: '', minus: '– ', subtotal: '= ', result: '= ' }

function drawStep(flow: Flow, step: SummaryStep): void {
  const strong = step.kind === 'subtotal' || step.kind === 'result'
  if (strong) flow.rule()
  const size = step.kind === 'result' ? SIZE.section : SIZE.body
  const valueX = PAGE.width - MARGIN.x - VALUE_COLUMN - 40
  flow.row(
    [
      { text: step.label, x: MARGIN.x, width: valueX - MARGIN.x - COLUMN_GAP, bold: strong },
      { text: `${SIGN[step.kind]}${step.amount}`, x: valueX, width: VALUE_COLUMN + 40, align: 'right', bold: strong },
    ],
    size,
  )
  if (step.detail) flow.text(step.detail, { size: SIZE.small, quiet: true, width: valueX - MARGIN.x - COLUMN_GAP })
}

/** What the font can draw: a true minus and narrow spaces become their plain forms, anything else unknown a question mark. */
function encodable(font: PDFFont, text: string): string {
  const known = new Set(font.getCharacterSet())
  let out = ''
  for (const char of text.replace(/−/g, '-').replace(/[  ]/g, ' ').replace(/[\r\n\t]+/g, ' ')) {
    out += known.has(char.codePointAt(0)!) ? char : '?'
  }
  return out
}

/** Breaks text into lines no wider than `width`; a single word wider than the column is cut. */
function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const fits = (candidate: string) => font.widthOfTextAtSize(candidate, size) <= width
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    let rest = word
    const joined = line === '' ? rest : `${line} ${rest}`
    if (fits(joined)) {
      line = joined
      continue
    }
    if (line !== '') lines.push(line)
    while (!fits(rest) && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  if (line !== '' || lines.length === 0) lines.push(line)
  return lines
}
