import { describe, it, expect } from 'vitest'
import { resolveBreakpoint } from './resolveBreakpoint'

describe('resolveBreakpoint', () => {
  it('returns "s" for width < 768', () => {
    expect(resolveBreakpoint(375)).toBe('s')
    expect(resolveBreakpoint(100)).toBe('s')
    expect(resolveBreakpoint(767)).toBe('s')
  })

  it('returns "m" for 768 <= width < 1280', () => {
    expect(resolveBreakpoint(768)).toBe('m')
    expect(resolveBreakpoint(1024)).toBe('m')
    expect(resolveBreakpoint(1279)).toBe('m')
  })

  it('returns "l" for width >= 1280', () => {
    expect(resolveBreakpoint(1280)).toBe('l')
    expect(resolveBreakpoint(1920)).toBe('l')
  })
})
