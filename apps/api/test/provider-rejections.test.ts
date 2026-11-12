import { describe, expect, it, vi } from 'vitest'
import { installProviderRejectionGuard, isLeftoverProviderStreamError } from '../src/ki/provider-rejections.js'

const sdkError = (message: string) => Object.assign(new Error(`[GoogleGenerativeAI Error]: ${message}`), { name: 'GoogleGenerativeAIError' })

describe('the leftover rejection of a broken Gemini stream', () => {
  it('recognises the error the Google SDK leaves behind, and nothing else', () => {
    expect(isLeftoverProviderStreamError(sdkError('Error reading from the stream'))).toBe(true)
    expect(isLeftoverProviderStreamError(new Error('[GoogleGenerativeAI Abort Error]: Request aborted when reading from the stream'))).toBe(true)
    expect(isLeftoverProviderStreamError(sdkError('API key not valid'))).toBe(false)
    expect(isLeftoverProviderStreamError(new Error('Error reading from the stream'))).toBe(false)
    expect(isLeftoverProviderStreamError('Error reading from the stream')).toBe(false)
  })

  it('lets that one pass with a warning, and keeps every other unhandled rejection fatal', () => {
    let handler: (reason: unknown) => void = () => {}
    const logger = { warn: vi.fn() } as never
    installProviderRejectionGuard({ on: ((_event: string, listener: (reason: unknown) => void) => { handler = listener }) as never }, logger)

    expect(() => handler(sdkError('Error reading from the stream'))).not.toThrow()
    expect((logger as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledTimes(1)

    const other = new Error('something else broke')
    expect(() => handler(other)).toThrow(other)
  })
})
