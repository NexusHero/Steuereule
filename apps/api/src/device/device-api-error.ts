// Translates a thrown better-auth APIError into the exact status/body shape the
// plugin's own (disabled) HTTP route would have returned (#238 task 2, ADR-0024) —
// `/v1/device/*` never invents its own error vocabulary for RFC 8628 states like
// `authorization_pending`/`slow_down`; the frontend's polling logic (task 3) gets the
// plugin's real error codes untouched, exactly as if it had reached better-auth's own
// HTTP route directly.
import { HttpException } from '@nestjs/common'
import { APIError } from 'better-auth'

/** Rethrows a better-auth `APIError` as the equivalent Nest `HttpException`
 *  (same status code, same JSON body); rethrows anything else unchanged. */
export function translateDeviceApiError(error: unknown): never {
  if (error instanceof APIError) {
    throw new HttpException(error.body ?? { message: error.message }, error.statusCode)
  }
  throw error
}
