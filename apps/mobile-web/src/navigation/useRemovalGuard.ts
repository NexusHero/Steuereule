import { useEffect, useRef } from 'react'
import { useLeaveGuardHost, type LeaveGuardHost } from '../screens/shared/leaveGuard'
import { blurActiveInput } from '../lib/blurActiveInput'

interface RemovableNavigation {
  readonly addListener: (
    event: 'beforeRemove',
    callback: (event: { readonly preventDefault: () => void; readonly data: { readonly action: unknown } }) => void,
  ) => () => void
  readonly dispatch: (action: never) => void
}

/**
 * WEB-40 / NM-05: every way a route holding a mask is removed — a sheet's X, backdrop or Escape, the
 * browser's back, „Später weiter“, the mask's own „Weiter“ — waits for the mask's pending saves and stays once
 * when one failed. The masks register through the returned host's `LeaveGuardProvider`.
 */
export function useRemovalGuard(navigation: RemovableNavigation): LeaveGuardHost {
  const host = useLeaveGuardHost()
  const leaving = useRef(false)
  const { guardedLeave, hasGuards } = host
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current || !hasGuards()) return
        event.preventDefault()
        // A focused field saves on blur; that save must be one of the pending ones.
        blurActiveInput()
        guardedLeave(() => {
          leaving.current = true
          try {
            navigation.dispatch(event.data.action as never)
          } finally {
            leaving.current = false
          }
        })
      }),
    [navigation, guardedLeave, hasGuards],
  )
  return host
}
