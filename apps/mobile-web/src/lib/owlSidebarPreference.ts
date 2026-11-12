export const OWL_SIDEBAR_STORAGE_KEY = 'steuereule.owlSidebar'

/** The owl's sidebar starts open; once the user collapses it, it stays collapsed (#481). */
export function readOwlSidebarOpen(): boolean {
  try {
    return globalThis.localStorage?.getItem(OWL_SIDEBAR_STORAGE_KEY) !== 'closed'
  } catch {
    return true
  }
}

export function writeOwlSidebarOpen(open: boolean): void {
  try {
    globalThis.localStorage?.setItem(OWL_SIDEBAR_STORAGE_KEY, open ? 'open' : 'closed')
  } catch {
    // storage disabled (private mode / CSP / native env)
  }
}
