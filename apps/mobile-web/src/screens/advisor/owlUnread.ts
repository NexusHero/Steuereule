import { useSyncExternalStore } from 'react'

/**
 * Whether an answer of the owl waits unread. A conversation keeps running while the user is on another
 * tab (the streams live above the tabs); when its answer arrives there, the owl's entry in the
 * navigation says so, until the owl is on screen again. Kept for the visit only: after a reload the
 * conversation list is the place that shows what is new.
 */
let visible = false
let unread = false
const listeners = new Set<() => void>()

function set(next: boolean): void {
  if (unread === next) return
  unread = next
  for (const listener of listeners) listener()
}

/** The owl's screen came into view or left it. Seeing it reads what waited. */
export function setOwlVisible(next: boolean): void {
  visible = next
  if (next) set(false)
}

/** A conversation's answer arrived. */
export function owlAnswerArrived(): void {
  if (!visible) set(true)
}

export function useOwlUnread(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => unread,
    () => false,
  )
}

/** Test-only: back to the state of a fresh visit. */
export function resetOwlUnread(): void {
  visible = false
  set(false)
}
