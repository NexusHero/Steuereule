import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Platform, Text } from 'react-native'
import { Input } from './Input'
import { Sheet, sheetKeyboardBehavior } from './Sheet'
import { WIDE_CONTENT_MAX_WIDTH } from '../responsive/contentWidth'
import { renderUi } from '../test-utils'

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function dragGrabberVertically(grabber: HTMLElement, dy: number) {
  const startEvent = new Event('touchstart', { bubbles: true, cancelable: true })
  Object.defineProperties(startEvent, {
    timeStamp: { value: 100 },
    touches: { value: [{ identifier: 1, clientX: 100, clientY: 100, pageX: 100, pageY: 100, target: grabber }] },
    changedTouches: { value: [{ identifier: 1, clientX: 100, clientY: 100, pageX: 100, pageY: 100, target: grabber }] },
  })
  grabber.dispatchEvent(startEvent)

  const moveEvent = new Event('touchmove', { bubbles: true, cancelable: true })
  Object.defineProperties(moveEvent, {
    timeStamp: { value: 150 },
    touches: { value: [{ identifier: 1, clientX: 100, clientY: 100 + dy, pageX: 100, pageY: 100 + dy, target: grabber }] },
    changedTouches: { value: [{ identifier: 1, clientX: 100, clientY: 100 + dy, pageX: 100, pageY: 100 + dy, target: grabber }] },
  })
  grabber.dispatchEvent(moveEvent)

  const endEvent = new Event('touchend', { bubbles: true, cancelable: true })
  Object.defineProperties(endEvent, {
    timeStamp: { value: 200 },
    touches: { value: [] },
    changedTouches: { value: [{ identifier: 1, clientX: 100, clientY: 100 + dy, pageX: 100, pageY: 100 + dy, target: grabber }] },
  })
  grabber.dispatchEvent(endEvent)
}

describe('Sheet', () => {
  beforeEach(() => {
    setViewportWidth(375)
  })

  afterEach(() => {
    setViewportWidth(375)
  })

  it('renders_children_and_close_button_with_label', () => {
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen" testID="test-sheet">
        <Text>Maskeninhalt</Text>
      </Sheet>,
    )

    expect(screen.getByTestId('test-sheet')).toBeTruthy()
    expect(screen.getByText('Maskeninhalt')).toBeTruthy()
    const closeBtn = screen.getByTestId('sheet-schliessen')
    expect(closeBtn).toBeTruthy()
    expect(closeBtn.textContent).toContain('Schließen')
  })

  it('exposes_dialog_semantics_and_moves_focus_into_panel_on_mount', () => {
    const outsideButton = document.createElement('button')
    document.body.appendChild(outsideButton)
    outsideButton.focus()
    expect(document.activeElement).toBe(outsideButton)

    try {
      renderUi(
        <Sheet onClose={() => {}} closeLabel="Schließen">
          <Text>Inhalt</Text>
        </Sheet>,
      )

      const dialog = screen.getByRole('dialog')
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.contains(document.activeElement)).toBe(true)
    } finally {
      outsideButton.remove()
    }
  })

  it('shows_grabber_full_width_and_top_rounded_corners_below_768px', () => {
    setViewportWidth(375)
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Mobil</Text>
      </Sheet>,
    )

    expect(screen.getByTestId('sheet-grabber')).toBeTruthy()
    const dialog = screen.getByRole('dialog')
    const styles = getComputedStyle(dialog)
    expect(dialog.style.width).toBe('100%')
    expect(parseFloat(styles.borderTopLeftRadius)).toBeGreaterThan(0)
    expect(parseFloat(styles.borderBottomLeftRadius)).toBe(0)
  })

  it('hides_grabber_and_caps_panel_width_at_WIDE_CONTENT_MAX_WIDTH_from_768px', () => {
    setViewportWidth(1024)
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Desktop</Text>
      </Sheet>,
    )

    expect(screen.queryByTestId('sheet-grabber')).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog.style.maxWidth).toBe(`${WIDE_CONTENT_MAX_WIDTH}px`)
  })

  it('calls_onClose_when_close_button_is_pressed', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )

    fireEvent.click(screen.getByTestId('sheet-schliessen'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls_onClose_when_backdrop_is_pressed', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )

    fireEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls_onClose_on_Escape_and_ignores_other_keys', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls_onClose_on_Escape_even_when_a_nested_Input_has_focus', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Input testID="sheet-inner-input" value="123" onChange={() => {}} />
      </Sheet>,
    )

    const input = screen.getByTestId('sheet-inner-input')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps_Tab_focus_inside_the_sheet_and_wraps_around', () => {
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Input testID="sheet-first-input" value="1" onChange={() => {}} />
        <Input testID="sheet-last-input" value="2" onChange={() => {}} />
      </Sheet>,
    )
    const close = screen.getByTestId('sheet-schliessen')
    const last = screen.getByTestId('sheet-last-input')

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('returns_focus_to_the_opener_when_the_sheet_unmounts', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )
    screen.getByTestId('sheet-schliessen').focus()
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('closes_on_grabber_drag_gt_120px_and_ignores_shorter_drag', () => {
    setViewportWidth(375)
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Ziehen</Text>
      </Sheet>,
    )

    const grabber = screen.getByTestId('sheet-grabber')

    dragGrabberVertically(grabber, 90)
    expect(onClose).not.toHaveBeenCalled()

    dragGrabberVertically(grabber, 140)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders_cleanly_in_dark_mode', () => {
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Dunkel</Text>
      </Sheet>,
      { mode: 'dark' },
    )
    expect(screen.getByText('Dunkel')).toBeTruthy()
  })

  it('uses padding keyboard-avoiding behavior on iOS only', () => {
    expect(sheetKeyboardBehavior('ios')).toBe('padding')
    expect(sheetKeyboardBehavior('android')).toBeUndefined()
    expect(sheetKeyboardBehavior('web')).toBeUndefined()

    const originalOs = Platform.OS
    try {
      ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
      renderUi(
        <Sheet onClose={() => {}} closeLabel="Schließen" testID="ios-sheet">
          <Text>Formular</Text>
        </Sheet>,
      )
      expect(screen.getByTestId('ios-sheet')).toBeTruthy()
      expect(screen.getByText('Formular')).toBeTruthy()
    } finally {
      ;(Platform as { OS: typeof Platform.OS }).OS = originalOs
    }
  })
})
