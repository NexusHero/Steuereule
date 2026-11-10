import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { stubStorageSetItem, assertNoStorageWrites } from '../test-storage-guard'
import {
  APPEARANCE_STORAGE_KEY,
  readAppearancePreference,
  writeAppearancePreference,
  resolveThemeMode,
} from './appearance'

describe('appearance preference storage and resolution', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('defaults to system without writing localStorage (no-client-persistence guard)', () => {
    const setItem = stubStorageSetItem('localStorage')

    expect(readAppearancePreference()).toBe('system')
    assertNoStorageWrites('localStorage', setItem)
  })

  it('reads back valid persisted values and falls back to system for invalid values', () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    expect(readAppearancePreference()).toBe('dark')

    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'light')
    expect(readAppearancePreference()).toBe('light')

    localStorage.setItem(APPEARANCE_STORAGE_KEY, 'invalid-value')
    expect(readAppearancePreference()).toBe('system')
  })

  it('writes steuereule.appearance only when explicitly updated', () => {
    writeAppearancePreference('dark')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')

    writeAppearancePreference('light')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light')

    writeAppearancePreference('system')
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('system')
  })

  it('survives blocked localStorage (throws on getItem/setItem) in try/catch', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError: storage blocked')
      },
      setItem() {
        throw new Error('SecurityError: storage blocked')
      },
    })

    expect(() => readAppearancePreference()).not.toThrow()
    expect(readAppearancePreference()).toBe('system')
    expect(() => writeAppearancePreference('dark')).not.toThrow()
  })

  it('resolves ThemeMode from preference and OS colorScheme', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark')
    expect(resolveThemeMode('system', 'light')).toBe('light')
    expect(resolveThemeMode('system', null)).toBe('light')
    expect(resolveThemeMode('system', undefined)).toBe('light')
    expect(resolveThemeMode('dark', 'light')).toBe('dark')
    expect(resolveThemeMode('light', 'dark')).toBe('light')
  })
})
