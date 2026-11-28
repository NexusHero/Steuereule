// loadPrintout — what the download asks for and what it reports back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/test-msw-server'
import { loadPrintout, loadPrintoutSummary } from './printoutDownload'

const { download } = vi.hoisted(() => ({ download: vi.fn() }))
vi.mock('../privacy/exportDownload', () => ({ triggerBrowserDownload: download }))

const PDF = () => new HttpResponse(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { 'content-type': 'application/pdf' } })

beforeEach(() => download.mockClear())
afterEach(() => server.resetHandlers())

describe('loadPrintout', () => {
  it('downloads the print PDF under the name of the year', async () => {
    let url = ''
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', ({ request }) => {
      url = request.url
      return PDF()
    }))
    expect(await loadPrintout(2025)).toEqual({ ok: true, status: 200 })
    expect(new URL(url).search).toBe('')
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'steuererklaerung-2025.pdf')
  })

  it('asks for the editable variant and names the file accordingly', async () => {
    let url = ''
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', ({ request }) => {
      url = request.url
      return PDF()
    }))
    expect(await loadPrintout(2025, { editable: true })).toEqual({ ok: true, status: 200 })
    expect(new URL(url).search).toBe('?bearbeitbar=true')
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'steuererklaerung-2025-bearbeitbar.pdf')
  })

  it('reports what is still missing when the server refuses with 422', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', () => HttpResponse.json({ missing: ['iban', 'kinder'] }, { status: 422 })))
    expect(await loadPrintout(2025)).toMatchObject({ ok: false, status: 422, missing: ['iban', 'kinder'] })
    expect(download).not.toHaveBeenCalled()
  })

  it('reports a 422 without a readable body as failed without a list', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', () => new HttpResponse('nope', { status: 422 })))
    expect(await loadPrintout(2025)).toMatchObject({ ok: false, status: 422 })
  })

  it('does not read the body of any other failure', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck', () => HttpResponse.json({ missing: ['x'] }, { status: 500 })))
    expect(await loadPrintout(2025)).toMatchObject({ ok: false, status: 500 })
  })
})

describe('loadPrintoutSummary', () => {
  it('downloads the summary alone under its own name', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck/zusammenfassung', () => PDF()))
    expect(await loadPrintoutSummary(2025)).toEqual({ ok: true, status: 200 })
    expect(download).toHaveBeenCalledWith(expect.any(Blob), 'steuereule-zusammenfassung-2025.pdf')
  })

  it('reports the same refusals as the printout: what is missing, or that the year is not paid', async () => {
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck/zusammenfassung', () => HttpResponse.json({ missing: ['iban'] }, { status: 422 })))
    expect(await loadPrintoutSummary(2025)).toMatchObject({ ok: false, status: 422, missing: ['iban'] })
    server.use(http.get('*/v1/steuerjahre/2025/ausdruck/zusammenfassung', () => HttpResponse.json({ message: 'nicht freigeschaltet' }, { status: 402 })))
    expect(await loadPrintoutSummary(2025)).toMatchObject({ ok: false, status: 402 })
    expect(download).not.toHaveBeenCalled()
  })
})
