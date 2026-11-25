import { afterEach, describe, expect, it } from 'vitest'
import { hasUnsavedWork, savePending, warnBeforeUnloadWithUnsavedWork } from './unsavedWork'

let uninstall: () => void = () => {}
afterEach(() => {
  uninstall()
  document.body.innerHTML = ''
})

function closeTab(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** WEB-40 on the web: closing the tab asks first while something typed or sent is not saved yet. */
describe('warnBeforeUnloadWithUnsavedWork', () => {
  it('asks while a save is on its way, and no longer once it settled', () => {
    uninstall = warnBeforeUnloadWithUnsavedWork(window)
    expect(closeTab()).toBe(false)
    const settled = savePending()
    expect(closeTab()).toBe(true)
    settled()
    settled()
    expect(hasUnsavedWork()).toBe(false)
    expect(closeTab()).toBe(false)
  })

  it('asks while a field holds typed input, and no longer once the field was left (it saves on blur)', () => {
    uninstall = warnBeforeUnloadWithUnsavedWork(window)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(closeTab()).toBe(false)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(closeTab()).toBe(true)
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(closeTab()).toBe(false)
  })

  it('ignores input that is no text field', () => {
    uninstall = warnBeforeUnloadWithUnsavedWork(window)
    const div = document.createElement('div')
    document.body.append(div)
    div.dispatchEvent(new Event('input', { bubbles: true }))
    expect(closeTab()).toBe(false)
  })
})
