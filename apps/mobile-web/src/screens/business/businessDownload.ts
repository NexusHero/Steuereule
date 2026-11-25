import { ApiError, getApiClientBaseUrl, NetworkError } from '@steuereule/api-client'
import { triggerBrowserDownload } from '../privacy/exportDownload'
import { problemOf, type ApiProblem } from './businessKit'

const FILENAME = /filename="([^"]+)"/

/** Fetches a file the API sends (the GoBD zip, the E-Bilanz XBRL) and hands it to the browser; a refusal is read like every other one (ApiError). */
export async function downloadBusinessFile(url: string, fallbackName: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: ApiProblem }> {
  try {
    const response = await fetch(`${getApiClientBaseUrl()}${url}`, { credentials: 'include' })
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null)
      return { ok: false, problem: problemOf(new ApiError(response.status, body, response.headers)) }
    }
    const blob = await response.blob()
    triggerBrowserDownload(blob, FILENAME.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName)
    return { ok: true }
  } catch (error) {
    return { ok: false, problem: problemOf(new NetworkError(error)) }
  }
}
