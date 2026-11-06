import { getApiClientBaseUrl } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../privacy/exportDownload'

export interface PrintoutResult {
  readonly ok: boolean
  readonly status: number
  readonly missing?: readonly string[]
}

export async function loadPrintout(year: number, { editable = false }: { editable?: boolean } = {}): Promise<PrintoutResult> {
  const query = editable ? '?bearbeitbar=true' : ''
  const response = await fetch(`${getApiClientBaseUrl()}/v1/steuerjahre/${year}/ausdruck${query}`, { credentials: 'include' })
  if (!response.ok) {
    const body = response.status === 422 ? ((await response.json().catch(() => ({}))) as { missing?: string[] }) : {}
    return { ok: false, status: response.status, ...(body.missing ? { missing: body.missing } : {}) }
  }
  triggerBrowserDownload(await response.blob(), `steuererklaerung-${year}${editable ? '-bearbeitbar' : ''}.pdf`)
  return { ok: true, status: response.status }
}
