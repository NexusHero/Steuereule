import { hapticWarning } from '@steuereule/ui'

export function triggerSaveErrorHaptic(): void {
  void hapticWarning()
}

export function warnOnHttpError(status: number): void {
  if (status >= 400) {
    void hapticWarning()
  }
}

/** An HTTP answer ≥ 400 to a save: the value did not reach the server. */
export class SaveFailedError extends Error {
  constructor(readonly status: number) {
    super(`save failed with HTTP ${status}`)
  }
}

/** Rejects on an HTTP error too, so callers that track saves see every failure, not only network errors. */
export function watchSaveResult<T extends { readonly status: number }>(promise: Promise<T>): Promise<T> {
  return promise.then(
    (res) => {
      if (res.status >= 400) {
        void hapticWarning()
        throw new SaveFailedError(res.status)
      }
      return res
    },
    (error) => {
      void hapticWarning()
      throw error
    },
  )
}
