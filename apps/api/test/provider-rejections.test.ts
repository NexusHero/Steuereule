import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installProviderRejectionGuard, isLeftoverProviderStreamError, REJECTION_DRAIN_MS } from '../src/ki/provider-rejections.js'

const sdkError = (message: string) => Object.assign(new Error(`[GoogleGenerativeAI Error]: ${message}`), { name: 'GoogleGenerativeAIError' })

describe('the leftover rejection of a broken Gemini stream', () => {
  it('recognises the error the Google SDK leaves behind, and nothing else', () => {
    expect(isLeftoverProviderStreamError(sdkError('Error reading from the stream'))).toBe(true)
    expect(isLeftoverProviderStreamError(new Error('[GoogleGenerativeAI Abort Error]: Request aborted when reading from the stream'))).toBe(true)
    expect(isLeftoverProviderStreamError(sdkError('API key not valid'))).toBe(false)
    expect(isLeftoverProviderStreamError(new Error('Error reading from the stream'))).toBe(false)
    expect(isLeftoverProviderStreamError('Error reading from the stream')).toBe(false)
  })
})

describe('an unhandled rejection ends the instance, but lets requests in flight finish first', () => {
  let handler: (reason: unknown) => void
  let order: string[]
  let finishDrain: () => void

  const install = (drain?: () => Promise<unknown>) => {
    const logger = { warn: vi.fn(), error: vi.fn() }
    order = []
    installProviderRejectionGuard({
      target: { on: ((_event: string, listener: (reason: unknown) => void) => (handler = listener)) as never },
      logger,
      report: () => order.push('report'),
      exit: (code) => order.push(`exit ${code}`),
      ...(drain ? { drain } : {}),
    })
    return logger
  }

  beforeEach(() => {
    vi.useFakeTimers()
    finishDrain = () => {}
  })
  afterEach(() => vi.useRealTimers())

  it('lets the leftover Gemini rejection pass with a warning and does not drain', () => {
    const drain = vi.fn(() => Promise.resolve())
    const logger = install(drain)
    handler(sdkError('Error reading from the stream'))
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(drain).not.toHaveBeenCalled()
    expect(order).toEqual([])
  })

  it('logs first, then drains, and exits non-zero only after the drain finished', async () => {
    install(() => new Promise<void>((resolve) => { order.push('drain'); finishDrain = () => { order.push('drained'); resolve() } }))
    handler(new Error('something else broke'))
    expect(order).toEqual(['report', 'drain'])

    finishDrain()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['report', 'drain', 'drained', 'exit 1'])
  })

  it('exits non-zero at the deadline when a request never finishes', async () => {
    install(() => new Promise(() => undefined))
    handler(new Error('boom'))
    await vi.advanceTimersByTimeAsync(REJECTION_DRAIN_MS - 1)
    expect(order).toEqual(['report'])
    await vi.advanceTimersByTimeAsync(1)
    expect(order).toEqual(['report', 'exit 1'])
  })

  it('exits non-zero when the close itself fails, and treats a second rejection as a log only', async () => {
    const drain = vi.fn(() => Promise.reject(new Error('close failed')))
    install(drain)
    handler(new Error('first'))
    handler(new Error('second'))
    await vi.advanceTimersByTimeAsync(0)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['report', 'report', 'exit 1'])
  })

  it('exits at once when the app does not exist yet', async () => {
    install()
    handler(new Error('during boot'))
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['report', 'exit 1'])
  })
})
