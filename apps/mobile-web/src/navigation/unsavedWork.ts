/**
 * WEB-40 on the web: closing or reloading the tab is no navigation, so no leave guard sees it. The browser asks
 * first while a save is still on its way or a field holds typed input that has not been committed yet (fields
 * save on blur). One count for every mask (`usePendingMutations` reports its saves here) and one document-wide
 * watch of typing; nothing per screen.
 */
let pendingSaves = 0
let editedField: EventTarget | null = null

/** A save started; call the returned function once it settled. */
export function savePending(): () => void {
  pendingSaves += 1
  let settled = false
  return () => {
    if (settled) return
    settled = true
    pendingSaves -= 1
  }
}

export function hasUnsavedWork(): boolean {
  return pendingSaves > 0 || editedField !== null
}

const isTextField = (target: EventTarget | null): boolean =>
  typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

/** Installs the watch on the window; returns the uninstall. */
export function warnBeforeUnloadWithUnsavedWork(target: Window): () => void {
  const onInput = (event: Event) => {
    if (isTextField(event.target)) editedField = event.target
  }
  // Leaving the field commits it: from then on the save, if any, is what counts.
  const onFocusOut = (event: Event) => {
    if (event.target === editedField) editedField = null
  }
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedWork()) return
    event.preventDefault()
    // Older browsers ask only when returnValue is set.
    event.returnValue = ''
  }
  target.addEventListener('input', onInput, true)
  target.addEventListener('focusout', onFocusOut, true)
  target.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    target.removeEventListener('input', onInput, true)
    target.removeEventListener('focusout', onFocusOut, true)
    target.removeEventListener('beforeunload', onBeforeUnload)
    editedField = null
  }
}
