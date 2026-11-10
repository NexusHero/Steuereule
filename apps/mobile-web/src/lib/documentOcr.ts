const ALLOWED_PDF_MIME = 'application/pdf'
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_PDF_TEXT_PAGES = 5
const MAX_PDF_OCR_PAGES = 3
const MIN_MEANINGFUL_TEXT_CHARS = 40

export type OcrStage = 'detecting' | 'pdf_text' | 'pdf_ocr_render' | 'image_ocr' | 'done'

export interface OcrProgress {
  readonly stage: OcrStage
  readonly page?: number
  readonly totalPages?: number
  readonly progress?: number
}

export interface DocumentOcrResult {
  readonly kind: 'pdf' | 'image'
  readonly mimeType: string
  readonly text: string
  readonly usedOcrFallback: boolean
  readonly pagesProcessed: number
}

export interface PdfJsLikePage {
  getTextContent(): Promise<{ readonly items: readonly { readonly str?: string }[] }>
  getViewport(params: { readonly scale: number }): { readonly width: number; readonly height: number }
  render(params: {
    readonly canvasContext: CanvasRenderingContext2D
    readonly viewport: { readonly width: number; readonly height: number }
  }): { readonly promise: Promise<void> }
}

export interface PdfJsLikeDocument {
  readonly numPages: number
  getPage(pageNumber: number): Promise<PdfJsLikePage>
  destroy?(): Promise<void>
}

export interface PdfJsLikeModule {
  getDocument(params: {
    readonly data: Uint8Array
    readonly disableAutoFetch?: boolean
    readonly isEvalSupported?: boolean
  }): { readonly promise: Promise<PdfJsLikeDocument> }
}

export interface TesseractLikeWorker {
  recognize(image: Blob | HTMLCanvasElement): Promise<{ readonly data: { readonly text: string } }>
  terminate(): Promise<unknown>
}

export interface OcrDependencies {
  readonly loadPdfJs?: () => Promise<PdfJsLikeModule>
  readonly createTesseractWorker?: (
    langs: string,
    options?: { readonly logger?: (msg: { readonly status?: string; readonly progress?: number }) => void },
  ) => Promise<TesseractLikeWorker>
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement
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

  const normalizedMime = fallbackMimeType?.split(';')[0]?.trim().toLowerCase()
  if (normalizedMime === ALLOWED_PDF_MIME || (normalizedMime && ALLOWED_IMAGE_MIMES.has(normalizedMime))) {
    return normalizedMime
  }

  const lowerName = fileName?.trim().toLowerCase() ?? ''
  if (lowerName.endsWith('.pdf')) return ALLOWED_PDF_MIME
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'
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

async function defaultCreateTesseractWorker(
  langs: string,
  options?: { readonly logger?: (msg: { readonly status?: string; readonly progress?: number }) => void },
): Promise<TesseractLikeWorker> {
  const tesseractMod = await import('tesseract.js')
  const worker = await tesseractMod.createWorker(langs, 1, options?.logger ? { logger: options.logger } : undefined)
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

function countNonWhitespaceChars(text: string): number {
  return text.replace(/\s+/g, '').length
}

/**
 * Extracts text strictly on-device (no image or PDF ever leaves the browser for OCR):
 * - PDF: reads text layer via pdfjs-dist (up to 5 pages); if sparse (< 40 chars, scanned PDF),
 *   renders pages (up to 3) to <canvas> and OCRs locally via tesseract.js (deu+eng).
 * - Image (JPEG/PNG/WebP): runs local WASM OCR via tesseract.js (deu+eng).
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
    throw new Error('Unsupported document format: expected PDF, JPEG, PNG or WebP.')
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
    }).promise

    try {
      const totalPages = Math.max(0, pdfDoc.numPages)
      const textLimit = Math.min(totalPages, MAX_PDF_TEXT_PAGES)
      const pageTexts: string[] = []

      for (let pageNo = 1; pageNo <= textLimit; pageNo++) {
        options.onProgress?.({ stage: 'pdf_text', page: pageNo, totalPages: textLimit })
        const page = await pdfDoc.getPage(pageNo)
        const content = await page.getTextContent()
        const line = content.items
          .map((item) => item.str ?? '')
          .filter((s) => s.length > 0)
          .join(' ')
          .trim()
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
        for (let pageNo = 1; pageNo <= ocrLimit; pageNo++) {
          options.onProgress?.({ stage: 'pdf_ocr_render', page: pageNo, totalPages: ocrLimit })
          const page = await pdfDoc.getPage(pageNo)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = createCanvas(viewport.width, viewport.height)
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            throw new Error('Could not obtain 2D canvas context for PDF OCR.')
          }
          await page.render({ canvasContext: ctx, viewport }).promise
          const res = await worker.recognize(canvas)
          const text = res.data.text.trim()
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
    const res = await worker.recognize(file)
    options.onProgress?.({ stage: 'done', progress: 1 })
    return {
      kind: 'image',
      mimeType,
      text: res.data.text.trim(),
      usedOcrFallback: false,
      pagesProcessed: 1,
    }
  } finally {
    await worker.terminate().catch(() => {})
  }
}
