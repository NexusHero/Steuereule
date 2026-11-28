import { useSyncExternalStore } from 'react'

/**
 * What this visit knows about unread answers of the owl. A conversation keeps running while the user is
 * on another tab (the streams live above the tabs); when its answer arrives there, the owl's entry in
 * the navigation says so at once. What stays unread across reloads and devices the server keeps, per
 * conversation (`useOwlUnreadOnServer`); this is the signal of the moment, and whether the owl is in view.
 */
let visible = false
let unread = false
const listeners = new Set<() => void>()
const tell = (): void => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The owl's screen came into view or left it. Seeing it reads what waited. */
export function setOwlVisible(next: boolean): void {
  if (visible === next && !(next && unread)) return
  visible = next
  if (next) unread = false
  tell()
}

/** Whether the owl's screen is the one in view: an answer shown there is read as it arrives. */
export function useOwlVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible, () => false)
}

/** A conversation's answer arrived. */
export function owlAnswerArrived(): void {
  if (visible || unread) return
  unread = true
  tell()
}

export function useOwlUnread(): boolean {
  return useSyncExternalStore(subscribe, () => unread, () => false)
}

/** Test-only: back to the state of a fresh visit. */
export function resetOwlUnread(): void {
  if (!visible && !unread) return
  visible = false
  unread = false
  tell()
}
