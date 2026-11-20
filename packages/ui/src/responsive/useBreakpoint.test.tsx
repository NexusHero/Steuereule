import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import * as ReactNative from 'react-native'
import { useBreakpoint } from './useBreakpoint'

afterEach(() => {
  vi.restoreAllMocks()
})

function withWindowWidth(width: unknown) {
  vi.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 } as ReactNative.ScaledSize)
}

describe('useBreakpoint', () => {
  it.each([
    [375, 's'],
    [768, 'm'],
    [1280, 'l'],
  ])('maps a %ipx window to %s', (width, expected) => {
    withWindowWidth(width)
    expect(renderHook(() => useBreakpoint()).result.current).toBe(expected)
  })

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY], ['wide']])(
    'falls back to the phone layout when the window reports %s',
    (width) => {
      withWindowWidth(width)
      expect(renderHook(() => useBreakpoint()).result.current).toBe('s')
    },
  )
})
