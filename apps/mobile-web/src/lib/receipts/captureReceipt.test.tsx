import { describe, expect, it, vi } from 'vitest'
import type { ParseReceiptDto } from '@steuereule/api-client'
import { captureReceipt, type CaptureReceiptDeps } from './captureReceipt'

const LSTB_TEXT = 'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 48.000,00'

function deps(text: string, kind: 'pdf' | 'image' = 'pdf', usedOcrFallback = false) {
  const parse = vi.fn(async (_dto: ParseReceiptDto) => ({
    status: 200 as const,
    data: { mode: 'deterministic_fallback', securityBlocked: false, parsed: {}, stagedAction: null, assistantMessage: null },
    headers: new Headers(),
  }))
  const upload = vi.fn(async () => ({ ok: true as const, status: 201 as const, data: { id: 'beleg-1' }, headers: new Headers() }))
  const extractText = vi.fn(async () => ({ kind, mimeType: 'application/pdf', text, usedOcrFallback, pagesProcessed: 1 }))
  return { parse, upload, extractText } as unknown as CaptureReceiptDeps & {
    parse: typeof parse
    upload: typeof upload
  }
}

const pdf = new File(['%PDF-1.7'], 'lstb.pdf', { type: 'application/pdf' })

describe('captureReceipt — the one receipt pipeline', () => {
  it('stores the original, reads text on the device, detects an LStB and parses it as pdf_text', async () => {
    const d = deps(LSTB_TEXT)
    const phases: string[] = []

    const result = await captureReceipt(pdf, { taxYear: 2025, deps: d, onPhase: (p) => phases.push(p) })

    expect(result).toMatchObject({ ok: true, kind: 'lstb', receiptId: 'beleg-1' })
    expect(d.parse).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'lstb', receiptId: 'beleg-1', textSource: 'pdf_text', rawText: LSTB_TEXT, stageDraft: true }),
    )
    expect(phases[0]).toBe('uploading')
    expect(phases.at(-1)).toBe('parsing')
  })

  it('sends only extracted text — never the file or image bytes — to the parse endpoint', async () => {
    const d = deps('Rechnung Monitor 349,00 EUR', 'image')
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'quittung.jpg', { type: 'image/jpeg' })

    await captureReceipt(photo, { taxYear: 2025, deps: d })

    const payload = d.parse.mock.calls[0]![0]
    expect(payload).toMatchObject({ kind: 'auto', textSource: 'ocr' })
    expect(Object.keys(payload)).not.toContain('imageBase64')
    expect(JSON.stringify(payload)).not.toContain('/9j/')
  })

  it('marks a scanned PDF (OCR fallback) as ocr, so its values are never green', async () => {
    const d = deps(LSTB_TEXT, 'pdf', true)
    await captureReceipt(pdf, { taxYear: 2025, deps: d })
    expect(d.parse.mock.calls[0]![0].textSource).toBe('ocr')
  })

  it('rejects unsupported files before uploading anything', async () => {
    const d = deps(LSTB_TEXT)
    const result = await captureReceipt(new File(['<html>'], 'evil.html', { type: 'text/html' }), { taxYear: 2025, deps: d })
    expect(result).toEqual({ ok: false, failure: 'unsupported_file' })
    expect(d.upload).not.toHaveBeenCalled()
  })

  it('reports empty text instead of sending nothing to the server', async () => {
    const d = deps('   ')
    expect(await captureReceipt(pdf, { taxYear: 2025, deps: d })).toEqual({ ok: false, failure: 'empty_text' })
    expect(d.parse).not.toHaveBeenCalled()
  })

  it('turns a file the device cannot read into a failure instead of throwing', async () => {
    const d = deps(LSTB_TEXT)
    ;(d as { extractText: unknown }).extractText = vi.fn(async () => {
      throw new Error('Invalid PDF structure')
    })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps: d })).toEqual({ ok: false, failure: 'read_failed' })
    expect(d.parse).not.toHaveBeenCalled()
  })
})
