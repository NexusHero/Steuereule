import { describe, expect, it } from 'vitest'
import { getTracer, withSpan } from '../src/telemetry/tracer.js'

describe('OpenTelemetry Tracer Integration', () => {
  it('returns a valid OpenTelemetry tracer instance', () => {
    const tracer = getTracer()
    expect(tracer).toBeDefined()
    expect(typeof tracer.startActiveSpan).toBe('function')
  })

  it('executes the wrapped callback and returns its result under withSpan', async () => {
    const result = await withSpan('test_operation', async () => {
      return 42 * 2
    }, { 'tax.year': 2026 })

    expect(result).toBe(84)
  })

  it('propagates errors while terminating the span correctly', async () => {
    await expect(
      withSpan('failing_operation', async () => {
        throw new Error('Simulation failed')
      }),
    ).rejects.toThrow('Simulation failed')
  })
})
