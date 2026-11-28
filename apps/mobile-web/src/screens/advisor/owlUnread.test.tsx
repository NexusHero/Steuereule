import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { owlAnswerArrived, resetOwlUnread, setOwlVisible, useOwlUnread, useOwlVisible } from './owlUnread'

afterEach(() => resetOwlUnread())

describe('an unread answer of the owl', () => {
  it('is marked when the answer arrives while the owl is not on screen', () => {
    const { result } = renderHook(() => useOwlUnread())
    expect(result.current).toBe(false)
    act(() => owlAnswerArrived())
    expect(result.current).toBe(true)
  })

  it('is not marked while the user is looking at the owl', () => {
    const { result } = renderHook(() => useOwlUnread())
    act(() => setOwlVisible(true))
    act(() => owlAnswerArrived())
    expect(result.current).toBe(false)
  })

  it('is read as soon as the owl comes on screen, and stays read after leaving', () => {
    const { result } = renderHook(() => useOwlUnread())
    act(() => owlAnswerArrived())
    act(() => setOwlVisible(true))
    expect(result.current).toBe(false)
    act(() => setOwlVisible(false))
    expect(result.current).toBe(false)
  })

  it('marks again for the next answer after the user left', () => {
    const { result } = renderHook(() => useOwlUnread())
    act(() => setOwlVisible(true))
    act(() => setOwlVisible(false))
    act(() => owlAnswerArrived())
    expect(result.current).toBe(true)
  })

  it('says whether the owl is in view, to whoever marks an answer as read', () => {
    const { result } = renderHook(() => useOwlVisible())
    expect(result.current).toBe(false)
    act(() => setOwlVisible(true))
    expect(result.current).toBe(true)
    act(() => setOwlVisible(false))
    expect(result.current).toBe(false)
  })
})
