import { ApiError, NetworkError, type UploadReceiptFileResult } from '@steuereule/api-client'

/**
 * The multipart upload is hand-written (`uploadReceiptFile`) and answers `{ ok, status, data, headers }`
 * instead of rejecting. WEB-10: its failure becomes the same `ApiError` a generated call rejects with, so a
 * 413 says "höchstens 10 MB", a 429 reads `Retry-After` and a guest hears that an account is needed — through
 * `net/apiFailure`, never "Prüf die Verbindung" for every one of them.
 */
export function uploadFailureError(result: Extract<UploadReceiptFileResult, { readonly ok: false }>): ApiError {
  return new ApiError(result.status, result.data, result.headers)
}

/** A thrown upload (no answer at all) as the shared offline failure; an abort or ApiError stays itself. */
export function thrownUploadError(thrown: unknown): unknown {
  return thrown instanceof TypeError ? new NetworkError(thrown) : thrown
}
