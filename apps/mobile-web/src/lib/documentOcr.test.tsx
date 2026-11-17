import { describe, expect, it, vi } from 'vitest'
import { detectDocumentMimeType, extractDocumentTextOnDevice, joinOcrWords, joinPdfTextItems, ocrRenderScale, type PdfJsLikeModule, type TesseractLikeWorker } from './documentOcr'

describe('documentOcr (on-device PDF & image OCR)', () => {
  it('detects PDF, JPEG, PNG, WEBP via magic bytes and falls back safely', () => {
    expect(detectDocumentMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('application/pdf')
    expect(detectDocumentMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectDocumentMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png')
    expect(
      detectDocumentMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe('image/webp')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), 'application/pdf')).toBe('application/pdf')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), undefined, 'scan.jpeg')).toBe('image/jpeg')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), undefined, 'scan.PNG')).toBe('image/png')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), undefined, 'scan.webp')).toBe('image/webp')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), undefined, 'scan.pdf')).toBe('application/pdf')
    expect(detectDocumentMimeType(new Uint8Array([1, 2]), 'text/html', 'evil.html')).toBeNull()
  })

  it('rejects unsupported document formats cleanly', async () => {
    const htmlBlob = new Blob(['<html>no</html>'], { type: 'text/html' })
    await expect(extractDocumentTextOnDevice(htmlBlob, { fileName: 'evil.html' })).rejects.toThrow(/Unsupported document/)
  })

  // #450 5D: pdf.js hands out text in pieces. The pieces were glued with one space, so a whole page
  // became ONE line and the LStB parser read the last number of the page as the Lohnsteuer —
  // a wrong value on a green field. A line ends where pdf.js says so (`hasEOL`) or the baseline moves.
  it('keeps the lines of a PDF text layer apart (a page is not one long line)', async () => {
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          destroy: async () => {},
          getPage: async () => ({
            getTextContent: async () => ({
              items: [
                { str: '3. Bruttoarbeitslohn', hasEOL: false, transform: [10, 0, 0, 10, 40, 700] },
                { str: '54.320,00', hasEOL: true, transform: [10, 0, 0, 10, 300, 700] },
                // No hasEOL, but the baseline moved: a new line.
                { str: '4. Einbehaltene Lohnsteuer', transform: [10, 0, 0, 10, 40, 686] },
                { str: '9.810,00', transform: [10, 0, 0, 10, 300, 686] },
              ],
            }),
            getViewport: () => ({ width: 800, height: 1000 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }
    const res = await extractDocumentTextOnDevice(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' }), {
      deps: { loadPdfJs: async () => pdfMod },
    })
    expect(res.text).toBe('3. Bruttoarbeitslohn 54.320,00\n4. Einbehaltene Lohnsteuer 9.810,00')
  })

  // Real-data run, step 3a: a form (Swiss Lohnausweis) keeps its labels and its amounts in separate
  // blocks of the content stream. Read in stream order no amount stands on its label's line.
  describe('joinPdfTextItems (reading order by position)', () => {
    it('puts an amount on the line of its label although the stream holds it elsewhere', () => {
      const text = joinPdfTextItems([
        // The amounts come first in the stream, right-aligned, in a larger font.
        { str: '54.321', transform: [10, 0, 0, 10, 521, 528.3] },
        { str: '-77', transform: [10, 0, 0, 10, 537, 392.1] },
        { str: '54.244', transform: [10, 0, 0, 10, 521, 376.5] },
        // Then the labels, top to bottom.
        { str: '1.', transform: [7, 0, 0, 7, 56.7, 545.5] },
        { str: 'Lohn', transform: [7, 0, 0, 7, 66.6, 545.5] },
        { str: 'Salario', transform: [7, 0, 0, 7, 66.6, 528.5] },
        { str: '/ Rendita', transform: [7, 0, 0, 7, 236.7, 528.5] },
        { str: '7.', transform: [7, 0, 0, 7, 56.7, 392.3] },
        { str: 'Andere Leistungen', transform: [7, 0, 0, 7, 66.6, 392.3] },
        { str: '8', transform: [7, 0, 0, 7, 56.7, 376.6] },
        { str: 'Bruttolohn total', transform: [7, 0, 0, 7, 66.6, 376.6] },
      ])
      expect(text).toBe(['1. Lohn', 'Salario / Rendita 54.321', '7. Andere Leistungen -77', '8 Bruttolohn total 54.244'].join('\n'))
    })

    it('keeps two close lines of small print apart', () => {
      const text = joinPdfTextItems([
        { str: 'Art - Genre - Genere', transform: [6, 0, 0, 6, 185, 479.4] },
        { str: '2.3 Andere - Autres - Altre', transform: [7, 0, 0, 7, 171, 485.9] },
      ])
      expect(text).toBe('2.3 Andere - Autres - Altre\nArt - Genre - Genere')
    })

    it('keeps the stream order when an item has no position, and on a page of turned text', () => {
      expect(joinPdfTextItems([{ str: 'b' }, { str: 'a', hasEOL: true }, { str: 'c' }])).toBe('b a\nc')
      const turned = [
        { str: 'zweite', transform: [0, 10, -10, 0, 100, 40] },
        { str: 'erste', hasEOL: true, transform: [0, 10, -10, 0, 80, 40] },
      ]
      expect(joinPdfTextItems(turned)).toBe('zweite erste')
    })
  })

  // Real-data run, step 3a: at 144 dpi the OCR read 5 of 9 amounts of a scanned certificate, at 300 dpi 8.
  describe('ocrRenderScale', () => {
    it('renders an A4 page at 300 dpi', () => {
      expect(ocrRenderScale(595, 842)).toBeCloseTo(300 / 72, 5)
    })

    it('caps the pixel count of a large page so a phone can hold the canvas', () => {
      const scale = ocrRenderScale(1190, 1684) // A2
      expect(scale).toBeLessThan(300 / 72)
      expect(1190 * 1684 * scale * scale).toBeLessThanOrEqual(9_000_001)
    })
  })

  it('renders a scanned page at 300 dpi and hands the OCR the prepared page, like a photo', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: 'Lohnausweis für das Jahr 2025 von der Firma und mit dem Betrag in CHF, Total der Beiträge' } })
    const scales: number[] = []
    const sizes: [number, number][] = []
    const painted: Uint8ClampedArray[] = []
    // The rendered page: dim paper (120) with one dark line.
    const createCanvas = (w: number, h: number) => {
      sizes.push([w, h])
      return {
        width: w,
        height: h,
        getContext: () => ({
          getImageData: () => {
            const data = new Uint8ClampedArray(w * h * 4)
            for (let i = 0; i < w * h; i++) {
              const v = Math.floor(i / w) === 10 && i % w > 4 && i % w < w - 4 ? 20 : 120
              data.set([v, v, v, 255], i * 4)
            }
            return { data, width: w, height: h }
          },
          createImageData: (cw: number, ch: number) => ({ data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }),
          putImageData: (img: { data: Uint8ClampedArray }) => painted.push(img.data),
        }),
      } as unknown as HTMLCanvasElement
    }
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getViewport: ({ scale }) => {
              scales.push(scale)
              return { width: 12 * scale, height: 6 * scale }
            },
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }
    const res = await extractDocumentTextOnDevice(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])]), {
      deps: { loadPdfJs: async () => pdfMod, createTesseractWorker: async () => ({ recognize, terminate: vi.fn().mockResolvedValue(undefined) }), createCanvas },
    })
    expect(res.usedOcrFallback).toBe(true)
    expect(scales.at(-1)).toBeCloseTo(300 / 72, 5)
    expect(sizes[0]).toEqual([50, 25])
    expect(recognize).toHaveBeenCalledOnce()
    // Flattened and binarised: only black and white reach the OCR.
    const values = new Set(Array.from(painted[0]!).filter((_, i) => i % 4 !== 3))
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
  })

  // A scanner's PDF often holds its page as JBIG2 or JPEG 2000; pdf.js decodes both with WASM it loads from `wasmUrl`.
  it('loads the pdf.js image decoders from the own origin', async () => {
    const getDocument = vi.fn((_params: Parameters<PdfJsLikeModule['getDocument']>[0]) => ({
      promise: Promise.resolve({
        numPages: 0,
        getPage: async (): Promise<never> => {
          throw new Error('none')
        },
      }),
    }))
    await extractDocumentTextOnDevice(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])]), { deps: { loadPdfJs: async () => ({ getDocument }) } })
    expect(getDocument.mock.calls[0]![0]).toMatchObject({ wasmUrl: `${globalThis.location.origin}/ocr/pdf/` })
  })

  // Real-data run: tesseract's own layout analysis loses the amount column of a ruled form (a scanned
  // Lohnsteuerbescheinigung kept 4 of 8 amounts). Read as sparse text, every word comes with its box;
  // the rows are rebuilt from the boxes.
  describe('joinOcrWords (rows of a scanned form by position)', () => {
    const word = (text: string, x0: number, y0: number, y1: number) => ({ text, bbox: { x0, y0, x1: x0 + text.length * 20, y1 } })

    it('puts a label and the amount at the far right of its row on one line', () => {
      const text = joinOcrWords([
        word('1.234,56', 2000, 498, 532),
        word('Krankenversicherung', 420, 500, 540),
        word('25.', 300, 500, 532),
        word('27.', 300, 600, 632),
        word('345,67', 2040, 598, 632),
        word('Arbeitslosenversicherung', 420, 600, 640),
      ])
      expect(text).toBe('25. Krankenversicherung 1.234,56\n27. Arbeitslosenversicherung 345,67')
    })

    it('keeps an amount in a taller font on the row of its small label, and two rows of small print apart', () => {
      const text = joinOcrWords([word('Salaire', 300, 500, 524), word('Salario', 300, 530, 554), word('54321', 2000, 520, 556)])
      expect(text).toBe('Salaire\nSalario 54321')
    })
  })

  it('reads a scanned page as sparse text and rebuilds its rows from the word boxes', async () => {
    const setParameters = vi.fn().mockResolvedValue(undefined)
    const recognize = vi.fn().mockResolvedValue({
      data: {
        text: 'Total\n\n88,00\n\nPrämie',
        blocks: [
          { paragraphs: [{ lines: [{ words: [{ text: '88,00', bbox: { x0: 900, y0: 100, x1: 1000, y1: 130 } }] }] }] },
          { paragraphs: [{ lines: [{ words: [{ text: 'Prämie', bbox: { x0: 100, y0: 100, x1: 220, y1: 136 } }, { text: 'Total', bbox: { x0: 240, y0: 100, x1: 330, y1: 130 } }] }] }] },
        ],
      },
    })
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }
    const res = await extractDocumentTextOnDevice(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])]), {
      deps: {
        loadPdfJs: async () => pdfMod,
        createTesseractWorker: async () => ({ recognize, setParameters, terminate: vi.fn().mockResolvedValue(undefined) }),
        createCanvas: () => ({ getContext: () => ({}) }) as unknown as HTMLCanvasElement,
      },
    })
    // The page segmentation is tesseract's own: sparse text lost digits behind dot leaders (scan corpus).
    expect(setParameters).not.toHaveBeenCalled()
    expect(recognize.mock.calls[0]![2]).toEqual({ blocks: true })
    expect(res.text).toBe('Prämie Total 88,00')
  })

  it('extracts digital PDF text without initializing Tesseract WASM', async () => {
    const createTesseractWorker = vi.fn()
    const destroy = vi.fn().mockResolvedValue(undefined)
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 2,
          destroy,
          getPage: async (n) => ({
            getTextContent: async () => ({
              items: [
                { str: n === 1 ? 'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025' : '3. Bruttoarbeitslohn 54.320,00' },
              ],
            }),
            getViewport: () => ({ width: 800, height: 1000 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }

    const stages: string[] = []
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' })
    const res = await extractDocumentTextOnDevice(pdfBlob, {
      onProgress: (p) => stages.push(p.stage),
      deps: { loadPdfJs: async () => pdfMod, createTesseractWorker },
    })

    expect(res.kind).toBe('pdf')
    expect(res.usedOcrFallback).toBe(false)
    expect(res.pagesProcessed).toBe(2)
    expect(res.text).toContain('Bruttoarbeitslohn 54.320,00')
    expect(createTesseractWorker).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledOnce()
    expect(stages).toEqual(['detecting', 'pdf_text', 'pdf_text', 'done'])
  })

  it('falls back to on-device canvas + Tesseract OCR when PDF text layer is sparse (scanned PDF)', async () => {
    const recognize = vi.fn().mockResolvedValue({ data: { text: '3. Bruttoarbeitslohn 48.000,00' } })
    const terminate = vi.fn().mockResolvedValue(undefined)
    const worker: TesseractLikeWorker = { recognize, terminate }

    const fakeCanvas = {
      getContext: () => ({}) as CanvasRenderingContext2D,
    } as unknown as HTMLCanvasElement

    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 8, // > MAX_PDF_OCR_PAGES (6) to prove cap
          getPage: async () => ({
            getTextContent: async () => ({ items: [{ str: '  ' }] }),
            getViewport: () => ({ width: 400, height: 600 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }

    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' })
    const stages: string[] = []
    const res = await extractDocumentTextOnDevice(pdfBlob, {
      onProgress: (p) => stages.push(p.stage),
      deps: {
        loadPdfJs: async () => pdfMod,
        createTesseractWorker: async (_langs, opts) => {
          opts?.logger?.({ status: 'recognizing', progress: 0.5 })
          return worker
        },
        createCanvas: () => fakeCanvas,
      },
    })

    expect(res.kind).toBe('pdf')
    expect(res.usedOcrFallback).toBe(true)
    expect(res.pagesProcessed).toBe(6)
    expect(recognize).toHaveBeenCalledTimes(6)
    expect(terminate).toHaveBeenCalledOnce()
    expect(stages).toContain('pdf_ocr_render')
  })

  it('handles 0-page PDF cleanly without starting Tesseract worker', async () => {
    const createTesseractWorker = vi.fn()
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 0,
          getPage: async () => {
            throw new Error('no pages')
          },
        }),
      }),
    }
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], { type: 'application/pdf' })
    const res = await extractDocumentTextOnDevice(pdfBlob, {
      deps: { loadPdfJs: async () => pdfMod, createTesseractWorker },
    })
    expect(res).toEqual({ kind: 'pdf', mimeType: 'application/pdf', text: '', usedOcrFallback: false, pagesProcessed: 0 })
    expect(createTesseractWorker).not.toHaveBeenCalled()
  })

  it('throws clear error if scanned PDF cannot acquire a 2D canvas context and terminates worker', async () => {
    const terminate = vi.fn().mockResolvedValue(undefined)
    const pdfMod: PdfJsLikeModule = {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      }),
    }
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])])
    await expect(
      extractDocumentTextOnDevice(pdfBlob, {
        deps: {
          loadPdfJs: async () => pdfMod,
          createTesseractWorker: async () => ({ recognize: vi.fn(), terminate }),
          createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
        },
      }),
    ).rejects.toThrow(/2D canvas context/)
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('runs local WASM OCR on raster images and terminates worker in finally', async () => {
    const terminate = vi.fn().mockResolvedValue(undefined)
    const recognize = vi.fn().mockResolvedValue({ data: { text: '  4. Lohnsteuer 9.840,00  ' } })

    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])], { type: 'image/png' })
    const progresses: number[] = []
    const res = await extractDocumentTextOnDevice(pngBlob, {
      onProgress: (p) => {
        if (typeof p.progress === 'number') progresses.push(p.progress)
      },
      deps: {
        createTesseractWorker: async (_langs, opts) => {
          opts?.logger?.({ progress: 0.75 })
          return { recognize, terminate }
        },
      },
    })

    expect(res).toEqual({
      kind: 'image',
      mimeType: 'image/png',
      text: '4. Lohnsteuer 9.840,00',
      usedOcrFallback: false,
      pagesProcessed: 1,
    })
    expect(progresses).toEqual([0, 0.75, 1])
    expect(terminate).toHaveBeenCalledOnce()
  })

  // #450 D3: a photo is flattened, turned upright, straightened and made black and white before the
  // OCR sees it (imagePreprocess.ts); the OCR gets that prepared canvas, not the raw file.
  it('hands the OCR the prepared photo, not the raw file', async () => {
    const terminate = vi.fn().mockResolvedValue(undefined)
    const recognize = vi.fn().mockResolvedValue({
      data: { text: '3. Bruttoarbeitslohn 54.320,00\n4. Einbehaltene Lohnsteuer 9.810,00\n25. Krankenversicherung 3.100,80' },
    })
    // A dim grey photo: paper 90, one dark line of "ink" 20.
    const width = 40
    const height = 20
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const v = Math.floor(i / width) === 10 && i % width > 4 && i % width < 35 ? 20 : 90
      rgba.set([v, v, v, 255], i * 4)
    }
    const painted: Uint8ClampedArray[] = []
    const createCanvas = (w: number, h: number) =>
      ({
        width: w,
        height: h,
        getContext: () => ({
          createImageData: (cw: number, ch: number) => ({ data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch }),
          putImageData: (img: { data: Uint8ClampedArray }) => painted.push(img.data),
        }),
      }) as unknown as HTMLCanvasElement

    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })
    const res = await extractDocumentTextOnDevice(jpeg, {
      deps: {
        createTesseractWorker: async () => ({ recognize, terminate }),
        decodeImage: async () => ({ data: rgba, width, height }),
        createCanvas,
      },
    })

    expect(res.text).toContain('Bruttoarbeitslohn 54.320,00')
    expect(recognize).toHaveBeenCalledOnce()
    expect(recognize.mock.calls[0]![0]).not.toBe(jpeg)
    // The dim paper became white, the line black: only 0 and 255 reach the OCR.
    const values = new Set(Array.from(painted[0]!).filter((_, i) => i % 4 !== 3))
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('falls back to the raw file when the photo cannot be decoded on this device', async () => {
    const terminate = vi.fn().mockResolvedValue(undefined)
    const recognize = vi.fn().mockResolvedValue({ data: { text: '4. Lohnsteuer 9.840,00' } })
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' })
    const res = await extractDocumentTextOnDevice(jpeg, {
      deps: { createTesseractWorker: async () => ({ recognize, terminate }), decodeImage: async () => null },
    })
    expect(res.text).toBe('4. Lohnsteuer 9.840,00')
    expect(recognize).toHaveBeenCalledWith(jpeg)
  })

  it('uses native blob.arrayBuffer() fast path when available (browser runtime)', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const nativeBlob = {
      type: 'image/png',
      arrayBuffer: async () => pngBytes.buffer,
    } as unknown as Blob
    const terminate = vi.fn().mockResolvedValue(undefined)
    const recognize = vi.fn().mockResolvedValue({ data: { text: '3. Bruttoarbeitslohn 52.000,00' } })

    const res = await extractDocumentTextOnDevice(nativeBlob, {
      deps: { createTesseractWorker: async () => ({ recognize, terminate }) },
    })
    expect(res.mimeType).toBe('image/png')
    expect(res.text).toBe('3. Bruttoarbeitslohn 52.000,00')
    expect(terminate).toHaveBeenCalledOnce()
  })
})
