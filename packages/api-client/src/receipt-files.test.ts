import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureApiClient, resetApiClientConfig } from './http-client'
import { fetchReceiptFileBlob, getReceiptFileUrl, uploadReceiptFile } from './receipt-files'

describe('receipt-files helper', () => {
  afterEach(() => {
    resetApiClientConfig()
    vi.restoreAllMocks()
  })

  it('builds credentialed file URLs using configured baseUrl and URL encoding', () => {
    configureApiClient({ baseUrl: 'https://api.steuereule.test' })
    expect(getReceiptFileUrl('rec/1 2')).toBe('https://api.steuereule.test/v1/belege/rec%2F1%202/datei')
  })

  it('uploads multipart FormData with credentials: include and parses 201 receipt metadata', async () => {
    configureApiClient({ baseUrl: 'https://api.steuereule.test' })
    const fakeReceipt = {
      id: 'rec-1',
      fileName: 'lstb.pdf',
      kind: 'Sonstiges',
      belegdatum: null,
      zahlungsdatum: null,
      hasFile: true,
      mimeType: 'application/pdf',
      byteLength: 42,
      assignment: { kind: 'ungebunden' },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fakeReceipt), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const res = await uploadReceiptFile({ file: blob, fileName: 'lstb.pdf', kind: 'Sonstiges' })

    expect(res.ok).toBe(true)
    expect(res.status).toBe(201)
    if (res.ok) {
      expect(res.data.id).toBe('rec-1')
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://api.steuereule.test/v1/belege/upload')
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('fetches binary blob with credentials: include and returns typed failure on 404', async () => {
    configureApiClient({ baseUrl: 'https://api.steuereule.test' })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))

    const okRes = await fetchReceiptFileBlob('rec-1')
    expect(okRes.ok).toBe(true)
    if (okRes.ok) {
      expect(okRes.mimeType).toBe('application/pdf')
      expect(okRes.blob.size).toBe(4)
    }

    const errRes = await fetchReceiptFileBlob('rec-missing')
    expect(errRes.ok).toBe(false)
    expect(errRes.status).toBe(404)
    expect(fetchSpy.mock.calls[0]![1]?.credentials).toBe('include')
  })
})
