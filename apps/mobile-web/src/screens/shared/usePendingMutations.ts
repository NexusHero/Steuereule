import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tracks in-flight saves so leaving a mask (`onDone` / `onBack` / closing a sheet / „Später weiter“) waits for
 * pending PUTs.
 *
 * WEB-12: a failed save is visible the moment it fails (`saveError`), not first at „Weiter“. A failed save also
 * keeps the user on the mask once (`saveFailed`), so the value is never lost without them seeing it; pressing
 * again leaves anyway (the server is the source of truth either way).
 */
export function usePendingMutations() {
  const pending = useRef(new Set<Promise<unknown>>())
  const failedSinceLastExit = useRef(false)
  const warned = useRef(false)
  const mounted = useRef(true)
  const [saveFailed, setSaveFailed] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const track = useCallback((promise: Promise<unknown>): void => {
    pending.current.add(promise)
    setPendingCount(pending.current.size)
    void promise
      .then(
        () => undefined,
        (error: unknown) => {
          failedSinceLastExit.current = true
          if (mounted.current) setSaveError(error)
        },
      )
      .finally(() => {
        pending.current.delete(promise)
        if (mounted.current) setPendingCount(pending.current.size)
      })
  }, [])

  /** A later save of the same field succeeded: the notice may go. */
  const clearSaveError = useCallback((): void => {
    failedSinceLastExit.current = false
    warned.current = false
    setSaveError(null)
    setSaveFailed(false)
  }, [])

  const flushThen = useCallback((callback?: () => void): void => {
    if (!callback) return
    const leaveOrWarn = () => {
      if (failedSinceLastExit.current && !warned.current) {
        warned.current = true
        if (mounted.current) setSaveFailed(true)
        return
      }
      failedSinceLastExit.current = false
      warned.current = false
      if (mounted.current) {
        setSaveFailed(false)
        setSaveError(null)
      }
      callback()
    }
    if (pending.current.size === 0) {
      leaveOrWarn()
      return
    }
    void Promise.allSettled(pending.current).then(leaveOrWarn)
  }, [])

  /** Resolves once every tracked save settled; true when none of them failed since the last exit. */
  const settled = useCallback(async (): Promise<boolean> => {
    await Promise.allSettled(pending.current)
    return !failedSinceLastExit.current
  }, [])

  return { track, flushThen, settled, saveFailed, saveError, clearSaveError, isSaving: pendingCount > 0 }
}
