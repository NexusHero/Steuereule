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

  it('treats an HTTP error answer as a failed save', async () => {
    await expect(watchSaveResult(Promise.resolve({ status: 409 }))).rejects.toBeInstanceOf(SaveFailedError)
  })
})
