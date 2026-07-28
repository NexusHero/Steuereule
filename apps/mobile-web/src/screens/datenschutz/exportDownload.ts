// REQ-011/ADR-0013 — the DSGVO export (`GET /v1/account/export?format=json|pdf`) is a binary
// attachment (`Content-Disposition: attachment`), not a JSON envelope. The generated
// `useAccountExportControllerExportAccount` query hook still routes through
// `packages/api-client/src/http-client.ts`'s `httpClient`, which unconditionally
// `response.text()` + `JSON.parse()`s the body — that throws on a PDF's actual bytes, and even
// for JSON a query hook's cache/refetch semantics are the wrong shape for "trigger a one-off
// file download". This module bypasses the generated hook for exactly that reason, reusing only
// `getApiClientBaseUrl()` (the same configured origin) and the same `credentials: 'include'`
// discipline as `httpClient` itself.
import { getApiClientBaseUrl } from '@steuereule/api-client'

export type ExportFormat = 'json' | 'pdf'

const FILENAME_PATTERN = /filename="([^"]+)"/

/** Pulls the server-set filename out of `Content-Disposition` (ADR-0013's frozen contract
 *  always sets one). The fallback is defense-in-depth, not a path the real API ever takes. */
export function extractExportFilename(contentDisposition: string | null, format: ExportFormat): string {
  const match = contentDisposition === null ? null : FILENAME_PATTERN.exec(contentDisposition)
  return match?.[1] ?? `steuereule-export.${format}`
}

/** Triggers a real browser file download from an already-fetched blob — the standard
 *  object-URL + hidden-anchor-click trick. Web-only (RN-Web, ADR-044); a native Expo build
 *  would need a different mechanism (share sheet / file system), which is out of scope here
 *  and tracked rather than guessed at (the `typeof document` guard makes this a no-op off web
 *  instead of throwing). */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export interface DownloadExportResult {
  readonly ok: boolean
  readonly status: number
}

/**
 * Fetches the export and, on a 2xx, triggers the real download. Never throws for an honest
 * HTTP-level failure (404 guest, 5xx, …) — those resolve with `ok: false` and the real status
 * so the caller renders a distinct, honest message per ADR-0013 rather than a generic one. A
 * genuine network failure (offline, DNS, CORS) still rejects, exactly like `httpClient`'s own
 * contract, so the caller's existing try/catch pattern (see LoginScreen) applies unchanged.
 */
export async function downloadAccountExport(format: ExportFormat): Promise<DownloadExportResult> {
  const response = await fetch(`${getApiClientBaseUrl()}/v1/account/export?format=${format}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  const blob = await response.blob()
  const filename = extractExportFilename(response.headers.get('content-disposition'), format)
  triggerBrowserDownload(blob, filename)
  return { ok: true, status: response.status }
}
