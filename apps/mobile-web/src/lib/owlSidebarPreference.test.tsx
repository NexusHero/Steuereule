import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OWL_PANEL_WIDTHS,
  OWL_SIDEBAR_STORAGE_KEY,
  readOwlPanelWidth,
  readOwlSidebarOpen,
  writeOwlPanelWidth,
  writeOwlSidebarOpen,
} from './owlSidebarPreference'

const brokenStorage = {
  getItem: () => {
    throw new Error('storage disabled')
  },
  setItem: () => {
    throw new Error('storage disabled')
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('the owl sidebar preference (#481)', () => {
  it('starts open and stays collapsed once the user collapsed it', () => {
    expect(readOwlSidebarOpen()).toBe(true)
    writeOwlSidebarOpen(false)
    expect(localStorage.getItem(OWL_SIDEBAR_STORAGE_KEY)).toBe('closed')
    expect(readOwlSidebarOpen()).toBe(false)
    writeOwlSidebarOpen(true)
    expect(readOwlSidebarOpen()).toBe(true)
  })

  it('falls back to open and never throws when storage is disabled', () => {
    vi.stubGlobal('localStorage', brokenStorage)
    expect(readOwlSidebarOpen()).toBe(true)
    expect(() => writeOwlSidebarOpen(false)).not.toThrow()
  })
})

describe('the dragged panel widths (#503)', () => {
  it('returns the initial width until the user dragged one', () => {
    expect(readOwlPanelWidth('sidebar')).toBe(OWL_PANEL_WIDTHS.sidebar.initial)
    expect(readOwlPanelWidth('workbench')).toBe(OWL_PANEL_WIDTHS.workbench.initial)
  })

  it('remembers a width, rounded, per panel', () => {
    writeOwlPanelWidth('sidebar', 300.4)
    expect(readOwlPanelWidth('sidebar')).toBe(300)
    expect(readOwlPanelWidth('workbench')).toBe(OWL_PANEL_WIDTHS.workbench.initial)
  })

  it('ignores a stored width outside the allowed range or not a number', () => {
    localStorage.setItem('steuereule.owlWidth.sidebar', '9999')
    expect(readOwlPanelWidth('sidebar')).toBe(OWL_PANEL_WIDTHS.sidebar.initial)
    localStorage.setItem('steuereule.owlWidth.sidebar', 'abc')
    expect(readOwlPanelWidth('sidebar')).toBe(OWL_PANEL_WIDTHS.sidebar.initial)
  })

  it('falls back to the initial width and never throws when storage is disabled', () => {
    vi.stubGlobal('localStorage', brokenStorage)
    expect(readOwlPanelWidth('workbench')).toBe(OWL_PANEL_WIDTHS.workbench.initial)
    expect(() => writeOwlPanelWidth('workbench', 500)).not.toThrow()
  })
})
