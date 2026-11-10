import { hapticWarning } from '@steuereule/ui'

export function triggerSaveErrorHaptic(): void {
  void hapticWarning()
}

export function warnOnHttpError(status: number): void {
  if (status >= 400) {
    void hapticWarning()
  }
}

export function watchSaveResult<T extends { readonly status: number }>(promise: Promise<T>): Promise<T> {
  return promise.then(
    (res) => {
      if (res.status >= 400) {
        void hapticWarning()
      }
      return res
    },
    (error) => {
      void hapticWarning()
      throw error
    },
  )
}
