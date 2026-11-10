import { afterEach, describe, expect, it, vi } from 'vitest'
import { Keyboard, Platform } from 'react-native'
import { blurActiveInput } from './blurActiveInput'

describe('blurActiveInput', () => {
  const originalOs = Platform.OS

  afterEach(() => {
    ;(Platform as { OS: typeof Platform.OS }).OS = originalOs
    vi.restoreAllMocks()
  })

  it('blurs the focused DOM element on web', () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'web'
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)
    const blurSpy = vi.spyOn(input, 'blur')

    blurActiveInput()

    expect(blurSpy).toHaveBeenCalledOnce()
    expect(document.activeElement).not.toBe(input)
    input.remove()
  })

  it('calls Keyboard.dismiss on native platforms', () => {
    ;(Platform as { OS: typeof Platform.OS }).OS = 'ios'
    const dismissSpy = vi.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})

    blurActiveInput()

    expect(dismissSpy).toHaveBeenCalledOnce()
  })
})
