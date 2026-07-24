import { describe, it, expect } from 'vitest'
import { resolveBreakpoint } from './useBreakpoint'

describe('resolveBreakpoint', () => {
  it('returns "s" for phone widths (< 768)', () => {
    expect(resolveBreakpoint(0)).toBe('s')
    expect(resolveBreakpoint(375)).toBe('s')
    expect(resolveBreakpoint(414)).toBe('s')
    expect(resolveBreakpoint(767)).toBe('s')
  })

  it('returns "m" for tablet widths (768 ≤ width < 1280)', () => {
    expect(resolveBreakpoint(768)).toBe('m')
    expect(resolveBreakpoint(1024)).toBe('m')
    expect(resolveBreakpoint(1279)).toBe('m')
  })

  it('returns "l" for desktop widths (≥ 1280)', () => {
    expect(resolveBreakpoint(1280)).toBe('l')
    expect(resolveBreakpoint(1920)).toBe('l')
    expect(resolveBreakpoint(3840)).toBe('l')
  })
})
