import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { AccessibilityInfo, Text } from 'react-native'
import { Sheet } from './Sheet'
import { FLOW_CONTENT_MAX_WIDTH, WIDE_CONTENT_MAX_WIDTH } from '../responsive/contentWidth'
import { renderUi } from '../test-utils'

function setViewportWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true })
  window.dispatchEvent(new Event('resize'))
}

function touch(grabber: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', dy: number, at: number) {
  const point = { identifier: 1, clientX: 100, clientY: 100 + dy, pageX: 100, pageY: 100 + dy, target: grabber }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { value: at },
    touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [point] },
    changedTouches: { value: [point] },
  })
  grabber.dispatchEvent(event)
}

afterEach(() => {
  vi.restoreAllMocks()
  setViewportWidth(375)
})

describe('Sheet behaviour', () => {
  it('names the close button in the interface language when no label is passed', () => {
    renderUi(
      <Sheet onClose={() => {}}>
        <Text>Inhalt</Text>
      </Sheet>,
    )
    expect(screen.getByTestId('sheet-schliessen').textContent).toBe('Schließen')
  })

  it('speaks English when the interface is English', () => {
    renderUi(
      <Sheet onClose={() => {}}>
        <Text>Content</Text>
      </Sheet>,
      { lng: 'en' },
    )
    expect(screen.getByTestId('sheet-schliessen').textContent).toBe('Close')
  })

  it('gives a flow sheet the calm reading column and an overview sheet the wide one on a tablet', () => {
    setViewportWidth(1024)
    const { unmount } = renderUi(
      <Sheet onClose={() => {}} width="flow">
        <Text>Maske</Text>
      </Sheet>,
    )
    const flowMax = parseFloat(screen.getByRole('dialog').style.maxWidth)
    unmount()
    renderUi(
      <Sheet onClose={() => {}} width="overview">
        <Text>Übersicht</Text>
      </Sheet>,
    )
    const overviewMax = parseFloat(screen.getByRole('dialog').style.maxWidth)
    expect(flowMax).toBeGreaterThan(FLOW_CONTENT_MAX_WIDTH)
    expect(overviewMax).toBe(WIDE_CONTENT_MAX_WIDTH)
    expect(flowMax).toBeLessThan(overviewMax)
  })

  it('wraps Shift+Tab from the panel itself to the last control and leaves forward Tab alone', () => {
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Nur Text</Text>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    const close = screen.getByTestId('sheet-schliessen')

    // Focus on the panel (not yet on a control): Shift+Tab wraps to the last control, Tab goes to the first.
    dialog.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(close)
    // Forward Tab from the panel is the browser's own business: it already moves inside the sheet.
    dialog.focus()
    expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(true)
  })

  it('pulls Tab back into the sheet when focus has wandered outside', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )
    outside.focus()
    fireEvent.keyDown(outside, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByTestId('sheet-schliessen'))
    outside.remove()
  })

  it('does not close on Escape while the user is composing text or a control already handled the key', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )
    fireEvent.keyDown(window, { key: 'Escape', isComposing: true })
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not return focus to an opener that has left the page', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const focus = vi.spyOn(opener, 'focus')
    const { unmount } = renderUi(
      <Sheet onClose={() => {}} closeLabel="Schließen">
        <Text>Inhalt</Text>
      </Sheet>,
    )
    opener.remove()
    focus.mockClear()
    unmount()
    expect(focus).not.toHaveBeenCalled()
  })

  it('springs back and stays open after a short drag when motion is allowed, and ignores upward drags', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Ziehen</Text>
      </Sheet>,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    const grabber = screen.getByTestId('sheet-grabber')
    touch(grabber, 'touchstart', 0, 100)
    touch(grabber, 'touchmove', -30, 150)
    touch(grabber, 'touchmove', 60, 170)
    touch(grabber, 'touchend', 60, 200)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Ziehen')).toBeTruthy()
  })

  it('snaps back when the drag is cancelled by the system', () => {
    const onClose = vi.fn()
    renderUi(
      <Sheet onClose={onClose} closeLabel="Schließen">
        <Text>Ziehen</Text>
      </Sheet>,
    )
    const grabber = screen.getByTestId('sheet-grabber')
    touch(grabber, 'touchstart', 0, 100)
    touch(grabber, 'touchmove', 80, 150)
    touch(grabber, 'touchcancel', 80, 200)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Ziehen')).toBeTruthy()
  })
})
