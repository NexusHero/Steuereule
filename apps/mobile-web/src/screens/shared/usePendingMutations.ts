import { useRef, useState } from 'react'

/**
 * Tracks in-flight saves so leaving a mask (`onDone` / `onBack` / closing a sheet) waits for pending PUTs.
 * A failed save keeps the user on the mask once and raises `saveFailed`, so the value is never lost
 * without them seeing it; pressing again leaves anyway (the server is the source of truth either way).
 */
export function usePendingMutations() {
  const pending = useRef(new Set<Promise<unknown>>())
  const failedSinceLastExit = useRef(false)
  const [saveFailed, setSaveFailed] = useState(false)

  function track(promise: Promise<unknown>): void {
    pending.current.add(promise)
    void promise
      .catch(() => {
        failedSinceLastExit.current = true
      })
      .finally(() => {
        pending.current.delete(promise)
      })
  }

  function flushThen(callback?: () => void): void {
    if (!callback) return
    const leaveOrWarn = () => {
      if (failedSinceLastExit.current && !saveFailed) {
        setSaveFailed(true)
        return
      }
      failedSinceLastExit.current = false
      setSaveFailed(false)
      callback()
    }
    if (pending.current.size === 0) {
      leaveOrWarn()
      return
    }
    void Promise.allSettled(pending.current).then(leaveOrWarn)
  }

  return { track, flushThen, saveFailed }
}
