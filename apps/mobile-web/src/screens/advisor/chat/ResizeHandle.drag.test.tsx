import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderInApp } from '../../../test-render'
import { ResizeHandle, resizedWidth } from './ResizeHandle'

function touch(target: HTMLElement, type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', dx: number, at: number) {
  const point = { identifier: 1, clientX: 100 + dx, clientY: 100, pageX: 100 + dx, pageY: 100, target }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { value: at },
    touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [point] },
    changedTouches: { value: [point] },
  })
  target.dispatchEvent(event)
}

function renderHandle(props: Partial<Parameters<typeof ResizeHandle>[0]> = {}) {
  const onResize = vi.fn()
  const onCommit = vi.fn()
  renderInApp(
    <ResizeHandle width={300} min={200} max={500} panel="left" onResize={onResize} onCommit={onCommit} label="Gespräche" testID="handle" {...props} />,
  )
  return { onResize, onCommit, handle: screen.getByTestId('handle') }
}

describe('resizedWidth', () => {
  it('widens a left panel when dragged right and a right panel when dragged left', () => {
    expect(resizedWidth(300, 40, 'left', 200, 500)).toBe(340)
    expect(resizedWidth(300, -40, 'right', 200, 500)).toBe(340)
  })

  it('stays inside the limits, and the minimum wins when the limits cross', () => {
    expect(resizedWidth(300, 900, 'left', 200, 500)).toBe(500)
    expect(resizedWidth(300, -900, 'left', 200, 500)).toBe(200)
    expect(resizedWidth(300, 50, 'left', 400, 100)).toBe(400)
  })
})

describe('ResizeHandle', () => {
  it('is a labelled vertical separator that reports its width to assistive technology', () => {
    const { handle } = renderHandle()
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('aria-valuenow')).toBe('300')
    expect(handle.getAttribute('aria-valuemin')).toBe('200')
    expect(handle.getAttribute('aria-valuemax')).toBe('500')
    expect(handle.getAttribute('aria-label')).toContain('Gespräche')
  })

  it('resizes with the arrow keys, remembers each step, and ignores other keys', () => {
    const { handle, onResize, onCommit } = renderHandle()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(324)
    expect(onCommit).toHaveBeenLastCalledWith(324)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(276)
    onResize.mockClear()
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onResize).not.toHaveBeenCalled()
  })

  it('arrow keys move a right-hand panel the other way and respect the limits', () => {
    const { handle, onResize } = renderHandle({ panel: 'right', width: 490 })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(500)
  })

  it('follows a drag and remembers the width once it ends', () => {
    const { handle, onResize, onCommit } = renderHandle()
    touch(handle, 'touchstart', 0, 100)
    touch(handle, 'touchmove', 50, 150)
    expect(onResize).toHaveBeenLastCalledWith(350)
    touch(handle, 'touchend', 50, 200)
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('does not remember a drag that the system cancelled', () => {
    const { handle, onCommit } = renderHandle()
    touch(handle, 'touchstart', 0, 100)
    touch(handle, 'touchmove', 30, 150)
    touch(handle, 'touchcancel', 30, 200)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('lights up under the pointer and goes quiet again', () => {
    const { handle } = renderHandle()
    const line = () => (handle.firstElementChild as HTMLElement).style.width
    expect(line()).toBe('1px')
    fireEvent.mouseEnter(handle)
    expect(line()).toBe('3px')
    fireEvent.mouseLeave(handle)
    expect(line()).toBe('1px')
  })
})
