// Tests-first (REQ-011/ADR-0013): written before exportDownload.ts exists. Covers the seam
// DatenschutzScreen.tsx delegates the real file download to — kept separate from the screen
// so the DOM-download mechanics (Content-Disposition parsing, anchor-click trick, object-URL
// lifecycle) are unit-tested directly rather than only indirectly through screen rendering.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetApiClientConfig, configureApiClient } from '@steuereule/api-client'
import { downloadAccountExport, extractExportFilename, triggerBrowserDownload } from './exportDownload'

describe('extractExportFilename', () => {
  it('reads the filename straight out of a real Content-Disposition header', () => {
    expect(
      extractExportFilename('attachment; filename="steuereule-export-2026-07-28.json"', 'json'),
    ).toBe('steuereule-export-2026-07-28.json')
  })

  it('falls back to an honest default when the header is missing (defense-in-depth, not the normal path)', () => {
    expect(extractExportFilename(null, 'pdf')).toBe('steuereule-export.pdf')
  })
})

describe('triggerBrowserDownload', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an object URL, clicks a download link with the given filename, then revokes the URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.fn()
    const realCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'a') (el as HTMLAnchorElement).click = click
      return el
    })

    const blob = new Blob(['hello'], { type: 'application/json' })
    triggerBrowserDownload(blob, 'steuereule-export-2026-07-28.json')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    const anchor = createElementSpy.mock.results[0]?.value as HTMLAnchorElement
    expect(anchor.download).toBe('steuereule-export-2026-07-28.json')
    expect(anchor.href).toContain('blob:mock-url')
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    vi.unstubAllGlobals()
  })
})

describe('downloadAccountExport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetApiClientConfig()
  })

  it('fetches the export from the configured origin with credentials included, and triggers a real download on 200', async () => {
    configureApiClient({ baseUrl: 'https://api.example.test' })
    const blob = new Blob(['{"schemaVersion":"1.0"}'], { type: 'application/json' })
    const response = new Response(blob, {
      status: 200,
      headers: { 'content-disposition': 'attachment; filename="steuereule-export-2026-07-28.json"' },
    })
    const fetchSpy = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetchSpy)
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.fn()
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'a') (el as HTMLAnchorElement).click = click
      return el
    })

    const result = await downloadAccountExport('json')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.example.test/v1/account/export?format=json',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(result).toEqual({ ok: true, status: 200 })
    expect(click).toHaveBeenCalledOnce()
  })

  it('does not trigger a download and reports the status honestly on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    const click = vi.fn()
    const realCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'a') (el as HTMLAnchorElement).click = click
      return el
    })

    const result = await downloadAccountExport('pdf')

    expect(result).toEqual({ ok: false, status: 404 })
    expect(click).not.toHaveBeenCalled()
  })

  it('propagates a genuine network failure (the caller distinguishes it from an honest HTTP status)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    await expect(downloadAccountExport('json')).rejects.toThrow('network down')
  })
})
