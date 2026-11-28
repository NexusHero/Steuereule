/**
 * The line of a spoken conversation as an SVG path: straight at rest, a wave whose height follows the
 * loudness while someone speaks. The wave is pinned at both ends and widest in the middle.
 */
export interface LineShape {
  readonly width: number
  readonly height: number
  /** Height of the wave in px at its widest point; 0 draws a straight line. */
  readonly amplitude: number
  /** Waves across the width. */
  readonly waves: number
  /** Where the wave is in its travel, in radians. */
  readonly phase: number
}

const STEP_PX = 6

export function linePath({ width, height, amplitude, waves, phase }: LineShape): string {
  const middle = height / 2
  if (amplitude <= 0 || width <= 0) return `M0 ${middle} L${Math.max(0, width)} ${middle}`
  let path = ''
  for (let x = 0; x <= width; x += STEP_PX) {
    const along = x / width
    const envelope = Math.sin(Math.PI * along) ** 2
    const wave = Math.sin(along * waves * 2 * Math.PI + phase) * 0.65 + Math.sin(along * waves * 4.6 * Math.PI - phase * 1.4) * 0.35
    path += `${x === 0 ? 'M' : 'L'}${x} ${(middle + amplitude * envelope * wave).toFixed(1)}`
  }
  return path
}

/** One bump that travels along a straight line: the owl is thinking. `at` is its centre in px. */
export function pulsePath({ width, height, amplitude, at }: { readonly width: number; readonly height: number; readonly amplitude: number; readonly at: number }): string {
  const middle = height / 2
  let path = ''
  for (let x = 0; x <= width; x += STEP_PX) {
    const bump = Math.exp(-(((x - at) / 38) ** 2))
    path += `${x === 0 ? 'M' : 'L'}${x} ${(middle - amplitude * bump * Math.sin(x / 9)).toFixed(1)}`
  }
  return path
}

/**
 * Loudness (RMS, 0 to 1) as a share of the full wave height. Speech sits around 0.02 to 0.2, so the root is
 * taken: a quiet voice already moves the line clearly, a loud one does not hit the ceiling at once.
 */
export function amplitudeShare(level: number): number {
  return Math.max(0, Math.min(1, Math.sqrt(Math.max(0, level) * 4)))
}
