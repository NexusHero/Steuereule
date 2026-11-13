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

/** The widths the user dragged the owl's side panels to; the chat keeps the rest (#503). */
export type OwlPanel = 'sidebar' | 'workbench'
export const OWL_PANEL_WIDTHS: Readonly<Record<OwlPanel, { readonly initial: number; readonly min: number; readonly max: number }>> = {
  sidebar: { initial: 280, min: 220, max: 480 },
  workbench: { initial: 400, min: 300, max: 720 },
}
/** The chat never gets narrower than this, however wide the panels are dragged. */
export const OWL_CHAT_MIN_WIDTH = 380

const widthKey = (panel: OwlPanel): string => `steuereule.owlWidth.${panel}`

export function readOwlPanelWidth(panel: OwlPanel): number {
  const { initial, min, max } = OWL_PANEL_WIDTHS[panel]
  try {
    const stored = Number(globalThis.localStorage?.getItem(widthKey(panel)))
    return Number.isFinite(stored) && stored >= min && stored <= max ? stored : initial
  } catch {
    return initial
  }
}

export function writeOwlPanelWidth(panel: OwlPanel, width: number): void {
  try {
    globalThis.localStorage?.setItem(widthKey(panel), String(Math.round(width)))
  } catch {
    // storage disabled (private mode / CSP / native env)
  }
}
