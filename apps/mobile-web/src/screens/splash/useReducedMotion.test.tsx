import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AccessibilityInfo } from 'react-native'
import { useReducedMotion } from './useReducedMotion'

afterEach(() => {
  vi.restoreAllMocks()
})

// `addEventListener` is overloaded for several unrelated accessibility events; the real,
// narrower shape we care about (`reduceMotionChanged`) isn't one TS can pick out of the
// overload set on its own, so the test-only mock is typed by hand instead of matching the
// full public signature.
type ReduceMotionHandler = (value: boolean) => void
function mockAddEventListener(impl: (event: string, handler: ReduceMotionHandler) => { remove: () => void }) {
  return vi
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(impl as unknown as typeof AccessibilityInfo.addEventListener)
}

describe('useReducedMotion', () => {
  it('defaults to reduced (true) before the platform answers', async () => {
    let resolveQuery: (value: boolean) => void = () => {}
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
      new Promise((resolve) => {
        resolveQuery = resolve
      }),
    )
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
    await act(async () => {
      resolveQuery(false)
      await Promise.resolve()
    })
  })

  it('reflects false once the platform reports motion is allowed', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(false))
  })

  it('reflects true once the platform reports reduced motion is preferred', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('updates live when reduceMotionChanged fires', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    let changeHandler: ReduceMotionHandler | undefined
    mockAddEventListener((event, handler) => {
      if (event === 'reduceMotionChanged') changeHandler = handler
      return { remove: () => {} }
    })
    const { result } = renderHook(() => useReducedMotion())
    await waitFor(() => expect(result.current).toBe(false))

    act(() => changeHandler?.(true))
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('unsubscribes on unmount', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const remove = vi.fn()
    mockAddEventListener(() => ({ remove }))
    const { unmount } = renderHook(() => useReducedMotion())
    unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
