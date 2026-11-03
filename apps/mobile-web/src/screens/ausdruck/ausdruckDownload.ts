// Downloads the paid Formular-Ausdruck (ADR-0050). Same mechanism as the DSGVO export:
// credentialed fetch on the configured API origin, then a browser download of the blob.
import { getApiClientBaseUrl } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../datenschutz/exportDownload'

export interface AusdruckErgebnis {
  readonly ok: boolean
  readonly status: number
  /** On 422: what the Hauptvordruck still needs (server's list, never re-derived here). */
  readonly fehlend?: readonly string[]
}

export async function ladeAusdruck(jahr: number): Promise<AusdruckErgebnis> {
  const response = await fetch(`${getApiClientBaseUrl()}/v1/steuerjahre/${jahr}/ausdruck`, { credentials: 'include' })
  if (!response.ok) {
    const body = response.status === 422 ? ((await response.json().catch(() => ({}))) as { fehlend?: string[] }) : {}
    return { ok: false, status: response.status, ...(body.fehlend ? { fehlend: body.fehlend } : {}) }
  }
  triggerBrowserDownload(await response.blob(), `steuererklaerung-${jahr}.pdf`)
  return { ok: true, status: response.status }
}
