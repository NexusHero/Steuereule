import { beforeEach, describe, expect, it, vi } from 'vitest'

const hapticWarning = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@steuereule/ui', async (importOriginal) => ({ ...(await importOriginal<typeof import('@steuereule/ui')>()), hapticWarning }))

import { SaveFailedError, triggerSaveErrorHaptic, warnOnHttpError, watchSaveResult } from './saveFeedback'

beforeEach(() => hapticWarning.mockClear())

describe('save feedback', () => {
  it('buzzes for a failed save', () => {
    triggerSaveErrorHaptic()
    expect(hapticWarning).toHaveBeenCalledTimes(1)
  })

  it('buzzes only for HTTP errors from 400 up', () => {
    warnOnHttpError(200)
    warnOnHttpError(399)
    expect(hapticWarning).not.toHaveBeenCalled()
    warnOnHttpError(400)
    warnOnHttpError(500)
    expect(hapticWarning).toHaveBeenCalledTimes(2)
  })

  it('lets a successful save through untouched', async () => {
    const res = { status: 200, data: 'ok' }
    await expect(watchSaveResult(Promise.resolve(res))).resolves.toBe(res)
    expect(hapticWarning).not.toHaveBeenCalled()
  })

  it('turns an HTTP error answer into a rejection that carries the status', async () => {
    const failure = await watchSaveResult(Promise.resolve({ status: 422 })).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(SaveFailedError)
    expect((failure as SaveFailedError).status).toBe(422)
    expect((failure as SaveFailedError).message).toContain('422')
    expect(hapticWarning).toHaveBeenCalledTimes(1)
  })

  it('rethrows a network error as it is and buzzes', async () => {
    const boom = new Error('offline')
    await expect(watchSaveResult(Promise.reject(boom))).rejects.toBe(boom)
    expect(hapticWarning).toHaveBeenCalledTimes(1)
  })
})
