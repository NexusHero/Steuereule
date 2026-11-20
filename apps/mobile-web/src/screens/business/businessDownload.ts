import { getApiClientBaseUrl } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../privacy/exportDownload'
import { problemOf, type ApiProblem } from './businessKit'

const FILENAME = /filename="([^"]+)"/

/** Fetches a file the API sends (the GoBD zip, the E-Bilanz XBRL) and hands it to the browser; a refusal keeps the API's reason. */
export async function downloadBusinessFile(url: string, fallbackName: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: ApiProblem }> {
  try {
    const response = await fetch(`${getApiClientBaseUrl()}${url}`, { credentials: 'include' })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      return { ok: false, problem: problemOf({ status: response.status, data: body }) }
    }
    const blob = await response.blob()
    triggerBrowserDownload(blob, FILENAME.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName)
    return { ok: true }
  } catch {
    return { ok: false, problem: { status: 0, code: null, message: null } }
  }
}
