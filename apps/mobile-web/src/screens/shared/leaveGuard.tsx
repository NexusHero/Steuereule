import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'

/**
 * WEB-40 / NM-05: leaving a mask by a way the mask does not own — the sheet's X, its backdrop, Escape, the
 * browser's back button, „Später weiter“ — waits for the mask's pending saves like its own „Weiter“ does,
 * and stays (once) when a save failed, so the failure is seen instead of lost with the unmounted mask.
 *
 * The container (a sheet, the Strom) provides the registry; each mask registers its `flushThen`.
 */
export type LeaveFlusher = (leave: () => void) => void

interface LeaveGuardRegistry {
  readonly register: (flusher: LeaveFlusher) => () => void
}

const LeaveGuardContext = createContext<LeaveGuardRegistry | null>(null)

let suspended = false

/**
 * Leaves without waiting for any mask: for a departure the user cannot be held back from, such as the sign-in
 * after an expired session, where every pending save fails with 401 and staying once would keep them on the mask.
 * `leave` must dispatch synchronously.
 */
export function leaveWithoutGuards(leave: () => void): void {
  suspended = true
  try {
    leave()
  } finally {
    suspended = false
  }
}

export function leaveGuardsSuspended(): boolean {
  return suspended
}

export interface LeaveGuardHost {
  readonly registry: LeaveGuardRegistry
  /** Runs every registered mask's flush in turn; `leave` only runs when all of them let go. */
  readonly guardedLeave: (leave: () => void) => void
  readonly hasGuards: () => boolean
}

export function useLeaveGuardHost(): LeaveGuardHost {
  const flushers = useRef(new Set<LeaveFlusher>())
  const registry = useMemo<LeaveGuardRegistry>(
    () => ({
      register(flusher) {
        flushers.current.add(flusher)
        return () => {
          flushers.current.delete(flusher)
        }
      },
    }),
    [],
  )
  const guardedLeave = useCallback((leave: () => void) => {
    const list = [...flushers.current]
    const run = (index: number): void => {
      const flusher = list[index]
      if (flusher === undefined) {
        leave()
        return
      }
      flusher(() => run(index + 1))
    }
    run(0)
  }, [])
  const hasGuards = useCallback(() => flushers.current.size > 0, [])
  return { registry, guardedLeave, hasGuards }
}

export function LeaveGuardProvider({ host, children }: { readonly host: LeaveGuardHost; readonly children: ReactNode }) {
  return <LeaveGuardContext.Provider value={host.registry}>{children}</LeaveGuardContext.Provider>
}

/** A mask's `flushThen`, offered to the container it is shown in. Outside a container this does nothing. */
export function useLeaveGuard(flusher: LeaveFlusher): void {
  const registry = useContext(LeaveGuardContext)
  const latest = useRef(flusher)
  latest.current = flusher
  useEffect(() => registry?.register((leave) => latest.current(leave)), [registry])
}
