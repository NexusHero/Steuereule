import { recognizePhoto, type GrayImage, type RgbaImage } from './imagePreprocess'

const ALLOWED_PDF_MIME = 'application/pdf'
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** An E-Rechnung as XRechnung file (ADR-0101 §22). */
const ALLOWED_XML_MIME = 'application/xml'
/** The names ZUGFeRD / Factur-X / XRechnung give the XML they embed in a PDF/A-3. */
const EMBEDDED_INVOICE_NAME = /(factur-x|zugferd|xrechnung)[\w-]*\.xml$/i
const INVOICE_ROOT = /<(?:[A-Za-z][\w.-]*:)?(Invoice|CreditNote|CrossIndustryInvoice)[\s>]/
/** A text layer costs nothing to read; a certificate with its supplementary sheets has more than five pages. */
const MAX_PDF_TEXT_PAGES = 12
/** A scanned Lohnausweis with its Beiblatt has five pages (real-data run); each page costs seconds of OCR. */
const MAX_PDF_OCR_PAGES = 6
const MIN_MEANINGFUL_TEXT_CHARS = 40
/** Scanners store 300 dpi; at 144 dpi the OCR lost four of nine amounts of a certificate (real-data run, step 3a). */
const OCR_TARGET_DPI = 300
/** An A4 page at 300 dpi, and below the canvas limit of phone browsers (16.7 million pixels). */
const MAX_OCR_PIXELS = 9_000_000

/** The scale a PDF page (size in points) is rendered at for the OCR: 300 dpi, less for a page too large to hold. */
export function ocrRenderScale(widthPt: number, heightPt: number): number {
  const wanted = OCR_TARGET_DPI / 72
  const area = Math.max(1, widthPt * heightPt)
  return area * wanted * wanted <= MAX_OCR_PIXELS ? wanted : Math.sqrt(MAX_OCR_PIXELS / area)
}

export type OcrStage = 'detecting' | 'pdf_text' | 'pdf_ocr_render' | 'image_ocr' | 'done'

export interface OcrProgress {
  readonly stage: OcrStage
  readonly page?: number
  readonly totalPages?: number
  readonly progress?: number
}

export interface DocumentOcrResult {
  readonly kind: 'pdf' | 'image' | 'xml'
  readonly mimeType: string
  readonly text: string
  readonly usedOcrFallback: boolean
  readonly pagesProcessed: number
  /** `text` is the XML of an E-Rechnung (an XRechnung file or the XML a ZUGFeRD PDF embeds). */
  readonly einvoice?: boolean
}

export interface PdfJsLikePage {
  getTextContent(): Promise<{ readonly items: readonly PdfTextItem[] }>
  getViewport(params: { readonly scale: number }): { readonly width: number; readonly height: number }
  render(params: {
    readonly canvasContext: CanvasRenderingContext2D
    readonly viewport: { readonly width: number; readonly height: number }
  }): { readonly promise: Promise<void> }
}

export interface PdfJsLikeDocument {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfJsLikePage>
  /** pdf.js: the embedded files of the PDF (a ZUGFeRD invoice carries its XML here). */
  getAttachments?(): Promise<Readonly<Record<string, { readonly filename: string; readonly content: Uint8Array }>> | null>
  destroy?(): Promise<void>
}

/** The part of a pdf.js text item the line reconstruction needs (`transform[5]` is the baseline). */
export interface PdfTextItem {
  readonly str?: string
  readonly hasEOL?: boolean
  readonly transform?: readonly number[]
}

/** In stream order: a line ends at pdf.js's own end-of-line mark or when the baseline moves by more than a pixel or two. */
function joinInStreamOrder(items: readonly PdfTextItem[]): string {
  const lines: string[] = []
  let current = ''
  let baseline: number | null = null
  const flush = () => {
    if (current.trim() !== '') lines.push(current.trim())
    current = ''
  }
  for (const item of items) {
    const y = item.transform?.[5] ?? null
    if (current !== '' && baseline !== null && y !== null && Math.abs(y - baseline) > 2) flush()
    if (item.str !== undefined && item.str !== '') current += (current === '' || current.endsWith(' ') ? '' : ' ') + item.str
    if (y !== null) baseline = y
    if (item.hasEOL === true) flush()
  }
  flush()
  return lines.join('\n')
}

interface PlacedItem {
  readonly str: string
  readonly x: number
  readonly y: number
  readonly size: number
}

/**
 * The text of a page in reading order: top to bottom, left to right. A form (the Swiss Lohnausweis) holds
 * its labels and its amounts in separate blocks of the content stream; read in stream order no amount
 * stands on the line of its label (real-data run, step 3a). Items whose baselines lie within a fraction
 * of the smaller font size share a line: an amount is set in a larger font than its label. A page
 * without positions, or one whose text is turned, keeps the stream order.
 */
export function joinPdfTextItems(items: readonly PdfTextItem[]): string {
  const placed: PlacedItem[] = []
  let turned = 0
  for (const item of items) {
    if (item.str === undefined || item.str === '') continue
    const t = item.transform
    if (t === undefined || t.length < 6) return joinInStreamOrder(items)
    if (Math.abs(t[1]!) > Math.abs(t[0]!)) turned++
    placed.push({ str: item.str, x: t[4]!, y: t[5]!, size: Math.hypot(t[2]!, t[3]!) || Math.hypot(t[0]!, t[1]!) })
  }
  if (placed.length === 0 || turned * 2 > placed.length) return joinInStreamOrder(items)

  // PDF coordinates grow upwards: the highest baseline is the first line. The sort is stable.
  const byHeight = [...placed].sort((a, b) => b.y - a.y)
  const lines: PlacedItem[][] = []
  for (const item of byHeight) {
    const line = lines.at(-1)
    const anchor = line?.[0]
    if (line !== undefined && anchor !== undefined && anchor.y - item.y <= Math.max(2, 0.4 * Math.min(anchor.size, item.size))) line.push(item)
    else lines.push([item])
  }
  return lines
    .map((line) =>
      [...line]
        .sort((a, b) => a.x - b.x)
        .reduce((text, item) => text + (text === '' || text.endsWith(' ') ? '' : ' ') + item.str, '')
        .trim(),
    )
    .filter((line) => line !== '')
    .join('\n')
}

export interface PdfJsLikeModule {
  getDocument(params: {
    readonly data: Uint8Array
    readonly disableAutoFetch?: boolean
    readonly isEvalSupported?: boolean
    /** Folder of pdf.js's WASM image decoders (JBIG2, JPEG 2000), with a trailing slash. */
    readonly wasmUrl?: string
  }): { readonly promise: Promise<PdfJsLikeDocument> }
}

/** A word tesseract found, with its box in pixels (y grows downwards). */
export interface OcrWord {
  readonly text: string
  readonly bbox: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
}

export interface OcrBlock {
  readonly paragraphs?: readonly { readonly lines?: readonly { readonly words?: readonly OcrWord[] }[] }[]
}

export interface TesseractLikeWorker {
  recognize(
    image: Blob | HTMLCanvasElement,
    options?: Record<string, never>,
    output?: { readonly blocks: boolean },
  ): Promise<{ readonly data: { readonly text: string; readonly blocks?: readonly OcrBlock[] | null } }>
  setParameters?(params: { readonly tessedit_pageseg_mode: string }): Promise<unknown>
  terminate(): Promise<unknown>
}


/**
 * The rows of a scanned page, rebuilt from the boxes of its words: top to bottom, left to right. A word
 * joins a row when its vertical centre lies within half the taller of the two heights of the row's
 * centre — an amount in a larger font stays on the row of its small label. Tesseract's own layout
 * analysis loses the amount column of a ruled form (real-data run: a scanned Lohnsteuerbescheinigung
 * kept 4 of 8 amounts, read this way all 8).
 */
export function joinOcrWords(words: readonly OcrWord[]): string {
  const placed = words
    .filter((w) => w.text.trim() !== '')
    .map((w) => ({ text: w.text.trim(), x: w.bbox.x0, centre: (w.bbox.y0 + w.bbox.y1) / 2, height: Math.max(1, w.bbox.y1 - w.bbox.y0) }))
    .sort((a, b) => a.centre - b.centre)
  const rows: { centre: number; height: number; words: typeof placed }[] = []
  for (const w of placed) {
    const row = rows.at(-1)
    if (row !== undefined && Math.abs(w.centre - row.centre) <= 0.5 * Math.max(w.height, row.height)) {
      row.words.push(w)
      row.centre += (w.centre - row.centre) / row.words.length
      row.height += (w.height - row.height) / row.words.length
    } else rows.push({ centre: w.centre, height: w.height, words: [w] })
  }
  return rows.map((row) => [...row.words].sort((a, b) => a.x - b.x).map((w) => w.text).join(' ')).join('\n')
}

/** Reads one scanned page: by word boxes where the engine hands them out, else its plain text. */
async function recognizePage(worker: TesseractLikeWorker, image: HTMLCanvasElement): Promise<string> {
  const { data } = await worker.recognize(image, {}, { blocks: true })
  const words = (data.blocks ?? []).flatMap((block) => (block.paragraphs ?? []).flatMap((p) => (p.lines ?? []).flatMap((line) => line.words ?? [])))
  return words.length > 0 ? joinOcrWords(words) : data.text
}

export interface OcrDependencies {
  readonly loadPdfJs?: () => Promise<PdfJsLikeModule>
  readonly createTesseractWorker?: (
    langs: string,
    options?: { readonly logger?: (msg: { readonly status?: string; readonly progress?: number }) => void },
  ) => Promise<TesseractLikeWorker>
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement
  /** Decodes a photo into pixels for the preprocessing; null where the device cannot. */
  readonly decodeImage?: (file: Blob) => Promise<RgbaImage | null>
}

export interface ExtractDocumentTextOptions {
  readonly mimeType?: string
  readonly fileName?: string
  readonly onProgress?: (progress: OcrProgress) => void
  readonly deps?: OcrDependencies
}

export function detectDocumentMimeType(
  bytes: Uint8Array,
  fallbackMimeType?: string,
  fileName?: string,
): string | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return ALLOWED_PDF_MIME
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  if (looksLikeInvoiceXml(bytes)) return ALLOWED_XML_MIME

  const normalizedMime = fallbackMimeType?.split(';')[0]?.trim().toLowerCase()
  if (normalizedMime === ALLOWED_XML_MIME || normalizedMime === 'text/xml') return ALLOWED_XML_MIME
  if (normalizedMime === ALLOWED_PDF_MIME || (normalizedMime && ALLOWED_IMAGE_MIMES.has(normalizedMime))) {
    return normalizedMime
  }

  const lowerName = fileName?.trim().toLowerCase() ?? ''
  if (lowerName.endsWith('.pdf')) return ALLOWED_PDF_MIME
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
  if (lowerName.endsWith('.xml')) return ALLOWED_XML_MIME
  return null
}

/** The first bytes are an XML document whose root is an invoice (no BOM, or a UTF-8 one). */
function looksLikeInvoiceXml(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, '').trimStart()
  return head.startsWith('<') && INVOICE_ROOT.test(head)
}

/** The XML a ZUGFeRD / Factur-X PDF embeds, when it is an invoice; null otherwise. */
async function embeddedInvoiceXml(doc: PdfJsLikeDocument): Promise<string | null> {
  if (typeof doc.getAttachments !== 'function') return null
  try {
    const attachments = await doc.getAttachments()
    for (const file of Object.values(attachments ?? {})) {
      if (!EMBEDDED_INVOICE_NAME.test(file.filename) && !file.filename.toLowerCase().endsWith('.xml')) continue
      const text = new TextDecoder('utf-8').decode(file.content).replace(/^\uFEFF/, '')
      if (INVOICE_ROOT.test(text.slice(0, 4096))) return text
    }
  } catch {
    // A broken attachment table is no reason to stop reading the visible text.
  }
  return null
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer()
    return new Uint8Array(buffer)
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result as ArrayBuffer), { once: true })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read document bytes.')), {
      once: true,
    })
    reader.readAsArrayBuffer(blob)
  })
  return new Uint8Array(buffer)
}

async function defaultLoadPdfJs(): Promise<PdfJsLikeModule> {
  const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = workerMod
  const pdfMod = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  return pdfMod as unknown as PdfJsLikeModule
}

/**
 * Same-origin paths of the self-hosted OCR assets (ADR-0060, scripts/ocr-assets.mjs). Without
 * them tesseract.js would download worker, WASM core and language data from a public CDN.
 */
export function selfHostedOcrPaths(origin: string): { workerPath: string; corePath: string; langPath: string } {
  const base = `${origin.replace(/\/$/, '')}/ocr`
  return { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
}

/**
 * Same-origin folder of pdf.js's WASM image decoders (ADR-0060). A scanner's PDF often holds its page as
 * JBIG2 or JPEG 2000; without the decoder pdf.js renders an empty page and the OCR reads nothing
 * (real-data run: „Text nicht lesbar“).
 */
export function selfHostedPdfWasmUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/ocr/pdf/`
}

async function defaultCreateTesseractWorker(
  langs: string,
  options?: { readonly logger?: (msg: { readonly status?: string; readonly progress?: number }) => void },
): Promise<TesseractLikeWorker> {
  const tesseractMod = await import('tesseract.js')
  const worker = await tesseractMod.createWorker(langs, 1, {
    ...selfHostedOcrPaths(globalThis.location?.origin ?? ''),
    gzip: true,
    workerBlobURL: false,
    ...(options?.logger ? { logger: options.logger } : {}),
  })
  return worker as unknown as TesseractLikeWorker
}

function defaultCreateCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new Error('On-device PDF OCR canvas rendering requires a browser document.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(width))
  canvas.height = Math.max(1, Math.floor(height))
  return canvas
}

async function defaultDecodeImage(file: Blob): Promise<RgbaImage | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = defaultCreateCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { data: pixels.data, width: pixels.width, height: pixels.height }
  } finally {
    bitmap.close()
  }
}

/** Paints a grey image onto a canvas, the input tesseract takes. */
function grayToCanvas(img: GrayImage, createCanvas: (width: number, height: number) => HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(img.width, img.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not obtain 2D canvas context for photo OCR.')
  const out = ctx.createImageData(img.width, img.height)
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i]!
    out.data[i * 4] = v
    out.data[i * 4 + 1] = v
    out.data[i * 4 + 2] = v
    out.data[i * 4 + 3] = 255
  }
  ctx.putImageData(out, 0, 0)
  return canvas
}

/** The pixels of a rendered page; null where the canvas cannot hand them out. */
function canvasPixels(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): RgbaImage | null {
  if (typeof ctx.getImageData !== 'function') return null
  try {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return { data: pixels.data, width: pixels.width, height: pixels.height }
  } catch {
    return null
  }
}

function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, '').length
}

/**
 * Extracts text strictly on-device (no image or PDF ever leaves the browser for OCR):
 * - PDF: reads text layer via pdfjs-dist (up to 12 pages, in reading order); if sparse (< 40 chars,
 *   scanned PDF), renders pages (up to 6) at 300 dpi to <canvas>, prepares them like a photo and OCRs
 *   locally via tesseract.js (deu+eng).
 * - Image (JPEG/PNG/WebP): prepares the photo (imagePreprocess.ts) and runs local WASM OCR via
 *   tesseract.js (deu+eng).
 */
export async function extractDocumentTextOnDevice(
  file: Blob,
  options: ExtractDocumentTextOptions = {},
): Promise<DocumentOcrResult> {
  options.onProgress?.({ stage: 'detecting' })
  const bytes = await readBlobBytes(file)
  const inferredName = options.fileName ?? (typeof File !== 'undefined' && file instanceof File ? file.name : undefined)
  const mimeType = detectDocumentMimeType(bytes, options.mimeType ?? file.type, inferredName)

  if (mimeType === null) {
    throw new Error('Unsupported document format: expected PDF, JPEG, PNG, WebP or an E-Rechnung (XML).')
  }

  // An XRechnung is the invoice itself: its XML goes to the reader as it is, no OCR (ADR-0101 §22).
  if (mimeType === ALLOWED_XML_MIME) {
    options.onProgress?.({ stage: 'done', progress: 1 })
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
    return { kind: 'xml', mimeType, text, usedOcrFallback: false, pagesProcessed: 0, einvoice: true }
  }

  const createWorker = options.deps?.createTesseractWorker ?? defaultCreateTesseractWorker

  if (mimeType === ALLOWED_PDF_MIME) {
    const loadPdfJs = options.deps?.loadPdfJs ?? defaultLoadPdfJs
    const createCanvas = options.deps?.createCanvas ?? defaultCreateCanvas
    const pdfjs = await loadPdfJs()
    const pdfDoc = await pdfjs.getDocument({
      data: bytes,
      disableAutoFetch: true,
      isEvalSupported: false,
      ...(globalThis.location?.origin ? { wasmUrl: selfHostedPdfWasmUrl(globalThis.location.origin) } : {}),
    }).promise

    try {
      // ZUGFeRD / Factur-X: the structured invoice beats any text read off the page.
      const embedded = await embeddedInvoiceXml(pdfDoc)
      if (embedded !== null) {
        options.onProgress?.({ stage: 'done', progress: 1 })
        return { kind: 'pdf', mimeType, text: embedded, usedOcrFallback: false, pagesProcessed: 0, einvoice: true }
      }
      const totalPages = Math.max(0, pdfDoc.numPages)
      const textLimit = Math.min(totalPages, MAX_PDF_TEXT_PAGES)
      const pageTexts: string[] = []

      for (let pageNo = 1; pageNo <= textLimit; pageNo++) {
        options.onProgress?.({ stage: 'pdf_text', page: pageNo, totalPages: textLimit })
        const page = await pdfDoc.getPage(pageNo)
        const content = await page.getTextContent()
        const line = joinPdfTextItems(content.items)
        if (line) pageTexts.push(line)
      }

      const combinedText = pageTexts.join('\n').trim()
      if (countNonWhitespaceChars(combinedText) >= MIN_MEANINGFUL_TEXT_CHARS) {
        options.onProgress?.({ stage: 'done', progress: 1 })
        return {
          kind: 'pdf',
          mimeType,
          text: combinedText,
          usedOcrFallback: false,
          pagesProcessed: textLimit,
        }
      }

      // Scanned / image-only PDF: render up to MAX_PDF_OCR_PAGES and OCR on-device
      const ocrLimit = Math.min(totalPages, MAX_PDF_OCR_PAGES)
      if (ocrLimit === 0) {
        options.onProgress?.({ stage: 'done', progress: 1 })
        return { kind: 'pdf', mimeType, text: combinedText, usedOcrFallback: false, pagesProcessed: 0 }
      }

      const ocrChunks: string[] = []
      const worker = await createWorker('deu+eng', {
        logger: (msg) => {
          if (typeof msg.progress === 'number') {
            options.onProgress?.({ stage: 'pdf_ocr_render', progress: msg.progress })
          }
        },
      })
      try {
        // Tesseract's own page segmentation stays on: „sparse text“ dropped leading digits behind dot
        // leaders („5.214,00“ read as „214,00“, scan corpus) and gained nothing on the real scans.
        for (let pageNo = 1; pageNo <= ocrLimit; pageNo++) {
          options.onProgress?.({ stage: 'pdf_ocr_render', page: pageNo, totalPages: ocrLimit })
          const page = await pdfDoc.getPage(pageNo)
          const size = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: ocrRenderScale(size.width, size.height) })
          const canvas = createCanvas(viewport.width, viewport.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            throw new Error('Could not obtain 2D canvas context for PDF OCR.')
          }
          await page.render({ canvasContext: ctx, viewport }).promise
          // A scanned page is a photo of paper: flattened, turned upright, straightened and binarised like one.
          const pixels = canvasPixels(ctx, canvas)
          const text = (
            pixels === null ? await recognizePage(worker, canvas) : await recognizePhoto(pixels, (prepared) => recognizePage(worker, grayToCanvas(prepared, createCanvas)))
          ).trim()
          if (text) ocrChunks.push(text)
        }
      } finally {
        await worker.terminate().catch(() => {})
      }

      options.onProgress?.({ stage: 'done', progress: 1 })
      return {
        kind: 'pdf',
        mimeType,
        text: ocrChunks.join('\n').trim() || combinedText,
        usedOcrFallback: true,
        pagesProcessed: ocrLimit,
      }
    } finally {
      await pdfDoc.destroy?.().catch(() => {})
    }
  }

  // Raster image (JPEG, PNG, WebP): run local WASM OCR via tesseract.js
  options.onProgress?.({ stage: 'image_ocr', progress: 0 })
  const worker = await createWorker('deu+eng', {
    logger: (msg) => {
      if (typeof msg.progress === 'number') {
        options.onProgress?.({ stage: 'image_ocr', progress: msg.progress })
      }
    },
  })
  try {
    // #450 D3: flatten, turn upright, straighten and binarise the photo first (imagePreprocess.ts).
    // A device that cannot decode the photo into pixels still gets the plain OCR of the file.
    const decodeImage = options.deps?.decodeImage ?? defaultDecodeImage
    const createCanvas = options.deps?.createCanvas ?? defaultCreateCanvas
    const pixels = await decodeImage(file).catch(() => null)
    const text =
      pixels === null
        ? (await worker.recognize(file)).data.text
        : await recognizePhoto(pixels, async (prepared) => (await worker.recognize(grayToCanvas(prepared, createCanvas))).data.text)
    options.onProgress?.({ stage: 'done', progress: 1 })
    return {
      kind: 'image',
      mimeType,
      text: text.trim(),
      usedOcrFallback: false,
      pagesProcessed: 1,
    }
  } finally {
    await worker.terminate().catch(() => {})
  }
}
