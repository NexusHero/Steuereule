import { useCallback, useRef } from 'react'

/**
 * Field-level bookkeeping on top of `usePendingMutations` (WEB-12): a failed save of a field shows the shared
 * notice at once; once every field that failed has been saved again, the notice goes. A later success of a
 * different field does not hide a failure that still stands.
 */
export function useTrackField(
  track: (promise: Promise<unknown>) => void,
  clearSaveError: () => void,
): (field: string, promise: Promise<unknown>) => void {
  const failed = useRef(new Set<string>())
  return useCallback(
    (field: string, promise: Promise<unknown>) => {
      track(
        promise.then(
          (value) => {
            if (failed.current.delete(field) && failed.current.size === 0) clearSaveError()
            return value
          },
          (error: unknown) => {
            failed.current.add(field)
            throw error
          },
        ),
      )
    },
    [track, clearSaveError],
  )
}
