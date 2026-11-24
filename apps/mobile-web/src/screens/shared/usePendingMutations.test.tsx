import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePendingMutations } from './usePendingMutations'
import { SaveFailedError, watchSaveResult } from './saveFeedback'

describe('usePendingMutations', () => {
  it('leaves the mask once every pending save succeeded', async () => {
    const { result } = renderHook(() => usePendingMutations())
    const leave = vi.fn()
    act(() => {
      result.current.track(Promise.resolve({ status: 200 }))
      result.current.flushThen(leave)
    })
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1))
    expect(result.current.saveFailed).toBe(false)
  })

  it('stays on the mask after a failed save and leaves on the second press', async () => {
    const { result } = renderHook(() => usePendingMutations())
    const leave = vi.fn()
    act(() => {
      result.current.track(watchSaveResult(Promise.resolve({ status: 500 })))
      result.current.flushThen(leave)
    })
    await waitFor(() => expect(result.current.saveFailed).toBe(true))
    expect(leave).not.toHaveBeenCalled()

    act(() => result.current.flushThen(leave))
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(1))
    expect(result.current.saveFailed).toBe(false)
  })

  it('WEB-12: a failed save is visible at once, before the user presses „Weiter“', async () => {
    const { result } = renderHook(() => usePendingMutations())
    const failure = new Error('HTTP 500')
    act(() => {
      result.current.track(Promise.reject(failure))
    })
    expect(result.current.isSaving).toBe(true)
    await waitFor(() => expect(result.current.saveError).toBe(failure))
    expect(result.current.isSaving).toBe(false)
    expect(result.current.saveFailed).toBe(false)
  })

  it('settled() waits for every pending save and reports whether one failed', async () => {
    const { result } = renderHook(() => usePendingMutations())
    let resolve: () => void = () => undefined
    act(() => {
      result.current.track(new Promise<void>((r) => { resolve = r }))
    })
    const done = result.current.settled()
    resolve()
    await expect(done).resolves.toBe(true)
  })

  it('treats an HTTP error answer as a failed save', async () => {
    await expect(watchSaveResult(Promise.resolve({ status: 409 }))).rejects.toBeInstanceOf(SaveFailedError)
  })
})
