import { afterEach, describe, expect, it } from 'vitest'
import { focusManager } from '@tanstack/react-query'
import { followAppStateFocus, type AppStateSource } from './app-focus'

function fakeAppState() {
  let listener: ((state: string) => void) | undefined
  const source: AppStateSource = {
    addEventListener: (_type, handler) => {
      listener = handler
      return { remove: () => (listener = undefined) }
    },
  }
  return { source, emit: (state: string) => listener?.(state), isSubscribed: () => listener !== undefined }
}

afterEach(() => focusManager.setFocused(undefined))

describe('followAppStateFocus', () => {
  it('marks queries focused when the app comes back to the foreground', () => {
    const appState = fakeAppState()
    followAppStateFocus(appState.source)

    appState.emit('background')
    appState.emit('active')

    expect(focusManager.isFocused()).toBe(true)
  })

  it('marks queries unfocused while the app is in the background', () => {
    const appState = fakeAppState()
    followAppStateFocus(appState.source)

    appState.emit('background')

    expect(focusManager.isFocused()).toBe(false)
  })

  it('stops listening once unsubscribed', () => {
    const appState = fakeAppState()
    const stop = followAppStateFocus(appState.source)

    stop()

    expect(appState.isSubscribed()).toBe(false)
  })
})
