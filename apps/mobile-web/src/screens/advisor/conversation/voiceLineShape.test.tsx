import { describe, expect, it } from 'vitest'
import { amplitudeShare, linePath, pulsePath } from './voiceLineShape'

const ys = (path: string): number[] => [...path.matchAll(/[ML]\d+ (-?[\d.]+)/g)].map((match) => Number(match[1]))

describe('the line of a spoken conversation', () => {
  it('is straight at rest', () => {
    expect(linePath({ width: 600, height: 120, amplitude: 0, waves: 4, phase: 1 })).toBe('M0 60 L600 60')
    expect(linePath({ width: 0, height: 120, amplitude: 20, waves: 4, phase: 1 })).toBe('M0 60 L0 60')
  })

  it('swings within its amplitude, is pinned at both ends and moves with the phase', () => {
    const path = linePath({ width: 600, height: 120, amplitude: 40, waves: 4, phase: 0.5 })
    const heights = ys(path)
    expect(heights[0]).toBe(60)
    expect(heights.at(-1)).toBeCloseTo(60, 0)
    expect(Math.max(...heights)).toBeLessThanOrEqual(100)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(20)
    expect(linePath({ width: 600, height: 120, amplitude: 40, waves: 4, phase: 2 })).not.toBe(path)
  })

  it('a thinking line is flat except around the bump, wherever that is', () => {
    const heights = ys(pulsePath({ width: 600, height: 120, amplitude: 14, at: 300 }))
    expect(heights[0]).toBeCloseTo(60, 0)
    expect(heights.at(-1)).toBeCloseTo(60, 0)
    expect(Math.max(...heights.map((y) => Math.abs(y - 60)))).toBeGreaterThan(5)
    expect(ys(pulsePath({ width: 600, height: 120, amplitude: 14, at: -80 })).every((y) => Math.abs(y - 60) < 0.2)).toBe(true)
  })

  it('turns loudness into a share of the full height: a quiet voice shows, a loud one stays within it', () => {
    expect(amplitudeShare(0)).toBe(0)
    expect(amplitudeShare(0.02)).toBeCloseTo(0.28, 2)
    expect(amplitudeShare(0.1)).toBeCloseTo(0.63, 2)
    expect(amplitudeShare(0.9)).toBe(1)
    expect(amplitudeShare(-1)).toBe(0)
  })
})
