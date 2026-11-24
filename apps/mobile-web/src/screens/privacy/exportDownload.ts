import { getApiClientBaseUrl } from '@steuereule/api-client'

export type ExportFormat = 'json' | 'pdf'

const FILENAME_PATTERN = /filename="([^"]+)"/

export function extractExportFilename(contentDisposition: string | null, format: ExportFormat): string {
  const match = contentDisposition === null ? null : FILENAME_PATTERN.exec(contentDisposition)
  return match?.[1] ?? `steuereule-export.${format}`
}

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
  /** The export needs a fresh sign-in or a re-entered password (ADR-0107 L1) — prompt and retry. */
  readonly stepUp?: boolean
}

export async function downloadAccountExport(format: ExportFormat): Promise<DownloadExportResult> {
  const response = await fetch(`${getApiClientBaseUrl()}/v1/account/export?format=${format}`, {
    credentials: 'include',
  })
  if (!response.ok) {
    if (response.status === 400) {
      try {
        const body = (await response.clone().json()) as { code?: unknown }
        if (body?.code === 'FRESH_AUTH_REQUIRED') {
          return { ok: false, status: response.status, stepUp: true }
        }
      } catch {
        // non-JSON body — not a step-up response
      }
    }
    return { ok: false, status: response.status }
  }
  const blob = await response.blob()
  const filename = extractExportFilename(response.headers.get('content-disposition'), format)
  triggerBrowserDownload(blob, filename)
  return { ok: true, status: response.status }
}
