import { getApiClientBaseUrl } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../datenschutz/exportDownload'

export interface AusdruckErgebnis {
  readonly ok: boolean
  readonly status: number
  readonly fehlend?: readonly string[]
}

export async function ladeAusdruck(jahr: number, { bearbeitbar = false }: { bearbeitbar?: boolean } = {}): Promise<AusdruckErgebnis> {
  const query = bearbeitbar ? '?bearbeitbar=true' : ''
  const response = await fetch(`${getApiClientBaseUrl()}/v1/steuerjahre/${jahr}/ausdruck${query}`, { credentials: 'include' })
  if (!response.ok) {
    const body = response.status === 422 ? ((await response.json().catch(() => ({}))) as { fehlend?: string[] }) : {}
    return { ok: false, status: response.status, ...(body.fehlend ? { fehlend: body.fehlend } : {}) }
  }
  triggerBrowserDownload(await response.blob(), `steuererklaerung-${jahr}${bearbeitbar ? '-bearbeitbar' : ''}.pdf`)
  return { ok: true, status: response.status }
}
