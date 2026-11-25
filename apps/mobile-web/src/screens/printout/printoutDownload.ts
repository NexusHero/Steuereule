import { ApiError, getApiClientBaseUrl } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../privacy/exportDownload'

export interface PrintoutResult {
  readonly ok: boolean
  readonly status: number
  readonly missing?: readonly string[]
  /** The refusal as an ApiError, for the shared wording (net/apiFailure). */
  readonly error?: ApiError
}

export async function loadPrintout(year: number, { editable = false }: { editable?: boolean } = {}): Promise<PrintoutResult> {
  const query = editable ? '?bearbeitbar=true' : ''
  const response = await fetch(`${getApiClientBaseUrl()}/v1/steuerjahre/${year}/ausdruck${query}`, { credentials: 'include' })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { missing?: string[] }
    const missing = response.status === 422 ? body.missing : undefined
    return { ok: false, status: response.status, ...(missing ? { missing } : {}), error: new ApiError(response.status, body, response.headers) }
  }
  triggerBrowserDownload(await response.blob(), `steuererklaerung-${year}${editable ? '-bearbeitbar' : ''}.pdf`)
  return { ok: true, status: response.status }
}
