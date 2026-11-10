import { describe, expect, it, vi } from 'vitest'
import { detectDocumentMimeType, extractDocumentTextOnDevice, type PdfJsLikeModule, type TesseractLikeWorker } from './documentOcr'

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
          numPages: 4, // > MAX_PDF_OCR_PAGES (3) to prove cap
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
    expect(res.pagesProcessed).toBe(3)
    expect(recognize).toHaveBeenCalledTimes(3)
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
