import { describe, it, expect, afterEach, vi } from 'vitest'
import { isHapticsEnabled, setHapticsEnabled } from '@steuereule/ui'
import { stubStorageSetItem, assertNoStorageWrites } from '../test-storage-guard'
import {
  HAPTICS_STORAGE_KEY,
  readHapticsPreference,
  syncHapticsPreferenceFromStorage,
  writeHapticsPreference,
} from './hapticsPreference'

describe('hapticsPreference', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
    setHapticsEnabled(true)
  })

  it('defaults to true without writing to localStorage', () => {
    const localSetItem = stubStorageSetItem('localStorage')
    expect(readHapticsPreference()).toBe(true)
    expect(syncHapticsPreferenceFromStorage()).toBe(true)
    expect(isHapticsEnabled()).toBe(true)
    assertNoStorageWrites('localStorage', localSetItem)
  })

  it('reads stored false/true values and forwards initial preference on sync', () => {
    localStorage.setItem(HAPTICS_STORAGE_KEY, 'false')
    expect(readHapticsPreference()).toBe(false)
    expect(syncHapticsPreferenceFromStorage()).toBe(false)
    expect(isHapticsEnabled()).toBe(false)

    writeHapticsPreference(true)
    expect(localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe('true')
    expect(syncHapticsPreferenceFromStorage()).toBe(true)
    expect(isHapticsEnabled()).toBe(true)
  })

  it('degrades gracefully when localStorage is blocked or throws', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('SecurityError')
      },
    })

    expect(readHapticsPreference()).toBe(true)
    expect(() => writeHapticsPreference(false)).not.toThrow()
  })
})
