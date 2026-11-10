// ADR-0060: the default OCR worker must load worker, WASM core and language data from our own
// origin. tesseract.js falls back to a public CDN for any path that is not set explicitly.
import { describe, expect, it, vi } from 'vitest'

const createWorker = vi.fn(async () => ({
  recognize: vi.fn(async () => ({ data: { text: 'Bruttoarbeitslohn 48.000,00' } })),
  terminate: vi.fn(async () => undefined),
}))
vi.mock('tesseract.js', () => ({ createWorker }))

const { extractDocumentTextOnDevice, selfHostedOcrPaths } = await import('./documentOcr')

describe('self-hosted OCR assets', () => {
  it('builds same-origin paths for worker, core and language data', () => {
    expect(selfHostedOcrPaths('https://www.steuereule.de/')).toEqual({
      workerPath: 'https://www.steuereule.de/ocr/worker.min.js',
      corePath: 'https://www.steuereule.de/ocr/core',
      langPath: 'https://www.steuereule.de/ocr/lang',
    })
  })

  it('never lets tesseract.js fall back to a CDN for a photo', async () => {
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], { type: 'image/jpeg' })

    await extractDocumentTextOnDevice(photo)

    expect(createWorker).toHaveBeenCalledTimes(1)
    const options = (createWorker.mock.calls[0] as unknown as [string, number, Record<string, unknown>])[2]
    const origin = globalThis.location.origin
    expect(options).toMatchObject({
      workerPath: `${origin}/ocr/worker.min.js`,
      corePath: `${origin}/ocr/core`,
      langPath: `${origin}/ocr/lang`,
      workerBlobURL: false,
    })
    for (const value of Object.values(options)) {
      if (typeof value === 'string') expect(value).not.toMatch(/jsdelivr|unpkg|cdn\./)
    }
  })
})
