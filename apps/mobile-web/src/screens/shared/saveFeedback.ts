import { hapticWarning } from '@steuereule/ui'

export function triggerSaveErrorHaptic(): void {
  void hapticWarning()
}

export function warnOnHttpError(status: number): void {
  if (status >= 400) {
    void hapticWarning()
  }
}

/**
 * Buzzes when a save fails and passes the failure on, so a caller that tracks saves (usePendingMutations) shows
 * it. Every HTTP status >= 400 already rejects with an ApiError (WEB-28); there is no status to read here.
 */
export function watchSaveResult<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    void hapticWarning()
    throw error
  })
}
