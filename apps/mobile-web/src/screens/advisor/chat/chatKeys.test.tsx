import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatKeyAction, clampComposerHeight, detectChatInputPlatform, isNearBottom } from './chatKeys'

describe('chatKeyAction (#451 decision 3)', () => {
  it('sends on Enter on a desktop', () => {
    expect(chatKeyAction({ key: 'Enter' }, 'desktop')).toBe('send')
  })

  it('inserts a newline on Shift+Enter on a desktop', () => {
    expect(chatKeyAction({ key: 'Enter', shiftKey: true }, 'desktop')).toBe('newline')
  })

  it('never sends on Enter on a touch device: the button sends', () => {
    expect(chatKeyAction({ key: 'Enter' }, 'touch')).toBe('newline')
    expect(chatKeyAction({ key: 'Enter', shiftKey: true }, 'touch')).toBe('newline')
  })

  it('ignores Enter while an IME composition is running', () => {
    expect(chatKeyAction({ key: 'Enter', isComposing: true }, 'desktop')).toBe('none')
  })

  it('maps Escape to stop on every platform', () => {
    expect(chatKeyAction({ key: 'Escape' }, 'desktop')).toBe('stop')
    expect(chatKeyAction({ key: 'Escape' }, 'touch')).toBe('stop')
  })

  it('leaves every other key alone', () => {
    expect(chatKeyAction({ key: 'a' }, 'desktop')).toBe('none')
  })
})

describe('detectChatInputPlatform', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('treats a coarse pointer without hover as touch', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse') }))
    expect(detectChatInputPlatform('web')).toBe('touch')
  })

  it('treats a fine pointer as desktop', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(detectChatInputPlatform('web')).toBe('desktop')
  })

  it('treats native platforms as touch', () => {
    expect(detectChatInputPlatform('ios')).toBe('touch')
    expect(detectChatInputPlatform('android')).toBe('touch')
  })
})

describe('clampComposerHeight', () => {
  it('grows with the content up to five lines', () => {
    expect(clampComposerHeight(10, 20)).toBe(20)
    expect(clampComposerHeight(60, 20)).toBe(60)
    expect(clampComposerHeight(500, 20)).toBe(100)
  })
})

describe('isNearBottom', () => {
  it('is true when the viewport touches the end of the content', () => {
    expect(isNearBottom({ offsetY: 560, viewportHeight: 400, contentHeight: 1000 })).toBe(true)
  })

  it('is false when the user scrolled up to read', () => {
    expect(isNearBottom({ offsetY: 100, viewportHeight: 400, contentHeight: 1000 })).toBe(false)
  })
})
