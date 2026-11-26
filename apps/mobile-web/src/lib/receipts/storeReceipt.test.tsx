import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ uploadReceiptFile: vi.fn(), fetchReceiptFileBlob: vi.fn(), getApiClientBaseUrl: vi.fn(() => 'http://api.test') }))
vi.mock('@steuereule/api-client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@steuereule/api-client')>()), ...api }))

import { storeReceipt } from './storeReceipt'
import { classifyApiFailure } from '../../net/apiFailure'
import { storedReceiptFile } from './storedReceiptFile'
import { uploadBusinessReceipt } from './uploadBusinessReceipt'

beforeEach(() => vi.clearAllMocks())

const file = new File(['x'], 'beleg.pdf', { type: 'application/pdf' })

describe('storeReceipt', () => {
  it('returns the id of the stored Beleg', async () => {
    api.uploadReceiptFile.mockResolvedValue({ ok: true, data: { id: 'r1' } })
    expect(await storeReceipt(file, 'spenden' as never)).toEqual({ ok: true, id: 'r1' })
    expect(api.uploadReceiptFile).toHaveBeenCalledWith({ file, fileName: 'beleg.pdf', kind: 'spenden' })
  })

  it('WEB-10: a refusal carries the status, body and Retry-After as an ApiError, a dropped request as offline', async () => {
    api.uploadReceiptFile.mockResolvedValue({ ok: false, status: 429, data: { code: 'RATE_LIMITED' }, headers: new Headers({ 'retry-after': '30' }) })
    const refused = await storeReceipt(file, 'spenden' as never)
    expect(refused.ok).toBe(false)
    const error = (refused as { error: unknown }).error
    expect(classifyApiFailure(error)).toMatchObject({ kind: 'rate-limited', retryAfterSeconds: 30 })

    api.uploadReceiptFile.mockResolvedValue({ ok: false, status: 413, data: null, headers: new Headers() })
    expect(classifyApiFailure((await storeReceipt(file, 'spenden' as never) as { error: unknown }).error).kind).toBe('too-large')

    api.uploadReceiptFile.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(classifyApiFailure((await storeReceipt(file, 'spenden' as never) as { error: unknown }).error).kind).toBe('offline')
  })
})

describe('storedReceiptFile', () => {
  it('turns the stored original back into a File with its name and type', async () => {
    api.fetchReceiptFileBlob.mockResolvedValue({ ok: true, blob: new Blob(['abc']), mimeType: 'application/pdf' })
    const result = await storedReceiptFile({ id: 'r1', fileName: 'beleg.pdf' })
    expect(result?.name).toBe('beleg.pdf')
    expect(result?.type).toBe('application/pdf')
  })

  it('answers null when the original is gone or unreachable', async () => {
    api.fetchReceiptFileBlob.mockResolvedValue({ ok: false })
    expect(await storedReceiptFile({ id: 'r1', fileName: 'a' })).toBeNull()
    api.fetchReceiptFileBlob.mockRejectedValue(new Error('offline'))
    expect(await storedReceiptFile({ id: 'r1', fileName: 'a' })).toBeNull()
  })
})

describe('uploadBusinessReceipt', () => {
  const respond = (status: number, body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 204 ? null : body, { status })))

  it('posts the file with its direction and reports the stored Beleg', async () => {
    respond(201, JSON.stringify({ id: 'b1' }))
    const result = await uploadBusinessReceipt('ausgabe')({ file, fileName: 'beleg.pdf' } as never)
    expect(result).toMatchObject({ ok: true, status: 201, data: { id: 'b1' } })
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/v1/belege/upload')
    expect(init.credentials).toBe('include')
    expect((init.body as FormData).get('direction')).toBe('ausgabe')
  })

  it('names an unnamed upload "beleg"', async () => {
    respond(201, '{}')
    await uploadBusinessReceipt('einnahme')({ file } as never)
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit
    expect(((init.body as FormData).get('file') as File).name).toBe('beleg')
  })

  it('hands back the error body of a refusal, or null for an empty one', async () => {
    respond(422, JSON.stringify({ code: 'x', message: 'no' }))
    expect(await uploadBusinessReceipt('ausgabe')({ file } as never)).toMatchObject({ ok: false, status: 422, data: { code: 'x' } })
    respond(204, '')
    expect(await uploadBusinessReceipt('ausgabe')({ file } as never)).toMatchObject({ ok: false, status: 204, data: null })
    respond(502, '<html>Bad gateway</html>')
    expect(await uploadBusinessReceipt('ausgabe')({ file } as never)).toMatchObject({ ok: false, status: 502, data: null })
    respond(500, '')
    expect(await uploadBusinessReceipt('ausgabe')({ file } as never)).toMatchObject({ ok: false, status: 500, data: null })
  })
})
