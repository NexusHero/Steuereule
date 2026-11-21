// captureReceipt's entry context and failure paths: what is passed on to the server, and what the
// user is told when the upload, the reading or the parsing goes wrong (ADR-0092, ADR-0097, ADR-0101).
import { describe, expect, it, vi } from 'vitest'
import type { ParseReceiptDto } from '@steuereule/api-client'
import { captureReceipt, type CaptureReceiptDeps } from './captureReceipt'

const TEXT = 'Ausdruck der elektronischen Lohnsteuerbescheinigung für 2025\n3. Bruttoarbeitslohn 48.000,00'
const pdf = new File(['%PDF-1.7'], 'beleg.pdf', { type: 'application/pdf' })

function makeDeps(over: Partial<{ [K in keyof CaptureReceiptDeps]: unknown }> = {}) {
  const parse = vi.fn(async (_dto: ParseReceiptDto) => ({ status: 200 as const, data: { processing: { state: 'nicht_lesbar', reason: 'unlesbar', pending: 0, applied: 0, draftsTaxYear: null } }, headers: new Headers() }))
  const upload = vi.fn(async () => ({ ok: true as const, status: 201 as const, data: { id: 'b1' }, headers: new Headers() }))
  const extractText = vi.fn(async (_file: File, opts?: { onProgress?: (p: { stage: string }) => void }) => {
    opts?.onProgress?.({ stage: 'ocr' })
    opts?.onProgress?.({ stage: 'done' })
    return { kind: 'pdf' as const, mimeType: 'application/pdf', text: TEXT, usedOcrFallback: false, pagesProcessed: 1 }
  })
  return { parse, upload, extractText, ...over } as unknown as CaptureReceiptDeps & { parse: typeof parse; upload: typeof upload; extractText: typeof extractText }
}

describe('captureReceipt — what the entry tells the server', () => {
  it('passes every piece of context on: mask, expected kind, holder, person, area, direction, duplicates', async () => {
    const deps = makeDeps()
    await captureReceipt(pdf, {
      taxYear: 2025,
      deps,
      kind: 'geschaeftsbeleg',
      direction: 'ausgabe',
      expectedKind: 'lstb' as never,
      mask: 'lstb' as never,
      allowDuplicate: true,
      person: 'B',
      area: 'kind:k1',
      holder: 'B',
      alsoFor: true,
      inChat: true,
    })
    expect(deps.parse.mock.calls[0]![0]).toMatchObject({
      inChat: true,
      kind: 'geschaeftsbeleg',
      direction: 'ausgabe',
      expectedKind: 'lstb',
      mask: 'lstb',
      allowDuplicate: true,
      person: 'B',
      area: 'kind:k1',
      holder: 'B',
      alsoFor: true,
    })
  })

  it('sends none of the optional context when the entry gave none, and never says person A', async () => {
    const deps = makeDeps()
    await captureReceipt(pdf, { taxYear: 2025, deps, person: 'A' })
    const dto = deps.parse.mock.calls[0]![0] as unknown as Record<string, unknown>
    for (const key of ['expectedKind', 'mask', 'allowDuplicate', 'person', 'area', 'holder', 'alsoFor', 'direction', 'inChat']) expect(dto).not.toHaveProperty(key)
  })

  it('reports reading progress except the finished stage', async () => {
    const deps = makeDeps()
    const phases: string[] = []
    await captureReceipt(pdf, { taxYear: 2025, deps, onPhase: (p) => phases.push(p) })
    expect(phases).toEqual(['uploading', 'ocr', 'parsing'])
  })
})

describe('captureReceipt — failures', () => {
  it('still reads and parses when the upload fails, without a stored Beleg', async () => {
    const deps = makeDeps({ upload: vi.fn(async () => Promise.reject(new Error('offline'))) })
    const result = await captureReceipt(pdf, { taxYear: 2025, deps })
    expect(result).toMatchObject({ ok: true, receiptId: null })
    expect(deps.parse.mock.calls[0]![0]).not.toHaveProperty('receiptId')
  })

  it('still reads and parses when the server refuses the upload', async () => {
    const deps = makeDeps({ upload: vi.fn(async () => ({ ok: false, status: 413 })) })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps })).toMatchObject({ ok: true, receiptId: null })
  })

  it('reports a parse the server answers with an error status as parse_failed', async () => {
    const deps = makeDeps({ parse: vi.fn(async () => ({ status: 500, data: {}, headers: new Headers() })) })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps })).toEqual({ ok: false, failure: 'parse_failed' })
  })

  it('reports a parse that throws as parse_failed', async () => {
    const deps = makeDeps({ parse: vi.fn(async () => Promise.reject(new Error('network'))) })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps })).toEqual({ ok: false, failure: 'parse_failed' })
  })

  it('records an unreadable file on the stored Beleg and returns the state the server recorded', async () => {
    const deps = makeDeps({ extractText: vi.fn(async () => Promise.reject(new Error('encrypted'))) })
    const result = await captureReceipt(pdf, { taxYear: 2025, deps })
    expect(result).toMatchObject({ ok: false, failure: 'read_failed', receiptId: 'b1', processing: { state: 'nicht_lesbar' } })
    expect(deps.parse.mock.calls[0]![0]).toMatchObject({ receiptId: 'b1', deviceReadFailure: 'read_failed' })
  })

  it('gives the file a name when it has none, and tolerates a recording that fails', async () => {
    const unnamed = new File(['%PDF-1.7'], ' ', { type: 'application/pdf' })
    const deps = makeDeps({ extractText: vi.fn(async () => ({ kind: 'pdf', mimeType: 'application/pdf', text: '   ', usedOcrFallback: false, pagesProcessed: 1 })) })
    deps.parse.mockRejectedValueOnce(new Error('offline'))
    const result = await captureReceipt(unnamed, { taxYear: 2025, deps })
    expect(result).toMatchObject({ ok: false, failure: 'empty_text', receiptId: 'b1', processing: null })
    expect(deps.parse.mock.calls[0]![0]).toMatchObject({ fileName: 'beleg' })
  })

  it('records nothing when the server did not accept the failure record', async () => {
    const deps = makeDeps({ extractText: vi.fn(async () => Promise.reject(new Error('x'))), parse: vi.fn(async () => ({ status: 404, data: {}, headers: new Headers() })) })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps })).toMatchObject({ ok: false, failure: 'read_failed', processing: null })
  })

  it('has nothing to record without a stored Beleg', async () => {
    const deps = makeDeps({ upload: vi.fn(async () => ({ ok: false })), extractText: vi.fn(async () => Promise.reject(new Error('x'))) })
    expect(await captureReceipt(pdf, { taxYear: 2025, deps })).toEqual({ ok: false, failure: 'read_failed', receiptId: null, processing: null })
    expect(deps.parse).not.toHaveBeenCalled()
  })
})
