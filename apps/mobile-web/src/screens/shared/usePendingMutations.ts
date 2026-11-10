import { useRef } from 'react'

/** Tracks in-flight async saves so exiting a mask (`onDone` / `onBack` / closing a sheet) waits for pending PUTs. */
export function usePendingMutations() {
  const pending = useRef(new Set<Promise<unknown>>())

  function track(promise: Promise<unknown>): void {
    pending.current.add(promise)
    void promise
      .finally(() => {
        pending.current.delete(promise)
      })
      .catch(() => {})
  }

  function flushThen(callback?: () => void): void {
    if (!callback) return
    if (pending.current.size === 0) {
      callback()
      return
    }
    void Promise.allSettled(pending.current).then(() => callback())
  }

  return { track, flushThen }
}
