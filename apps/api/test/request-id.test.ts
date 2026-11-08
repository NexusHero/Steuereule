import { describe, expect, it } from 'vitest'
import { resolveTraceId } from '../src/common/request-id.js'

describe('resolveTraceId', () => {
  it('extracts the 32-character trace-id from a valid W3C traceparent header', () => {
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    const result = resolveTraceId({ traceparent })
    expect(result).toBe('4bf92f3577b34da6a3ce929d0e0e4736')
  })

  it('adopts x-request-id if no valid traceparent is present', () => {
    const result = resolveTraceId({ 'x-request-id': 'client-req-12345' })
    expect(result).toBe('client-req-12345')
  })

  it('generates a fresh UUID v4 if neither header is provided', () => {
    const result = resolveTraceId({})
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('falls back to UUID if traceparent is malformed', () => {
    const result = resolveTraceId({ traceparent: 'invalid-header' })
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})
