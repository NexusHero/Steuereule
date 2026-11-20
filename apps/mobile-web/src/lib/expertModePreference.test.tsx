import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXPERT_MODE_STORAGE_KEY, readExpertMode, useExpertMode, writeExpertMode } from './expertModePreference'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('expert mode preference', () => {
  it('is off unless switched on', () => {
    expect(readExpertMode()).toBe(false)
    localStorage.setItem(EXPERT_MODE_STORAGE_KEY, 'false')
    expect(readExpertMode()).toBe(false)
  })

  it('updates every open screen that reads it', () => {
    const { result } = renderHook(() => useExpertMode())
    expect(result.current).toBe(false)
    act(() => writeExpertMode(true))
    expect(localStorage.getItem(EXPERT_MODE_STORAGE_KEY)).toBe('true')
    expect(result.current).toBe(true)
    act(() => writeExpertMode(false))
    expect(result.current).toBe(false)
  })

  it('holds the switch for this run when storage is disabled', () => {
    const broken = {
      getItem: () => {
        throw new Error('disabled')
      },
      setItem: () => {
        throw new Error('disabled')
      },
    }
    vi.stubGlobal('localStorage', broken)
    expect(readExpertMode()).toBe(false)
    const { result } = renderHook(() => useExpertMode())
    act(() => writeExpertMode(true))
    expect(result.current).toBe(true)
    // restore for the other tests: the in-memory fallback is reset by writing through working storage
    vi.unstubAllGlobals()
    act(() => writeExpertMode(false))
  })
})
