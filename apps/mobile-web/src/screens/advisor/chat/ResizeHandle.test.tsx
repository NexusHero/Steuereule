import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { ResizeHandle, resizedWidth } from './ResizeHandle'
import { OWL_PANEL_WIDTHS, readOwlPanelWidth, writeOwlPanelWidth } from '../../../lib/owlSidebarPreference'
import { renderInApp } from '../../../test-render'

afterEach(() => globalThis.localStorage?.clear())

describe('resizing the owl’s side panels (#503)', () => {
  it('a panel on the left grows when the line is dragged right, one on the right when it is dragged left', () => {
    expect(resizedWidth(280, 40, 'left', 220, 480)).toBe(320)
    expect(resizedWidth(400, -60, 'right', 300, 720)).toBe(460)
  })

  it('stays within its limits, so the chat keeps its room', () => {
    expect(resizedWidth(280, 900, 'left', 220, 480)).toBe(480)
    expect(resizedWidth(280, -900, 'left', 220, 480)).toBe(220)
    // A limit below the minimum (a narrow window) never pushes the panel under its minimum.
    expect(resizedWidth(300, 50, 'left', 220, 100)).toBe(220)
  })

  it('is a separator that says what it resizes, and the arrow keys move it', () => {
    const onResize = vi.fn()
    const onCommit = vi.fn()
    renderInApp(<ResizeHandle width={280} min={220} max={480} panel="left" onResize={onResize} onCommit={onCommit} label="Gespräche und Notizen" testID="handle" />)
    const handle = screen.getByTestId('handle')
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-label')).toBe('Breite ändern: Gespräche und Notizen')
    expect(handle.getAttribute('aria-valuenow')).toBe('280')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(304)
    expect(onCommit).toHaveBeenLastCalledWith(304)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(256)
  })

  it('remembers a dragged width and ignores one that is out of range', () => {
    expect(readOwlPanelWidth('sidebar')).toBe(OWL_PANEL_WIDTHS.sidebar.initial)
    writeOwlPanelWidth('sidebar', 351.6)
    expect(readOwlPanelWidth('sidebar')).toBe(352)
    writeOwlPanelWidth('workbench', 5000)
    expect(readOwlPanelWidth('workbench')).toBe(OWL_PANEL_WIDTHS.workbench.initial)
  })
})
