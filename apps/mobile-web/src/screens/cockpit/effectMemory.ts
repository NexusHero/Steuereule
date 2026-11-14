// UX review H1 — „Wirkungszeile“: after a save the cockpit says what the change did to the refund.
// The cockpit remounts after a mask closes, so what it saw last lives here, per tax year, for the
// lifetime of the page: the last estimate midpoint and the area the user opened from the cockpit.
import type { TileId } from './tiles'

export interface Effect {
  /** Change of the estimate midpoint in euros; positive = more refund / less back payment. */
  readonly deltaEur: number
  /** The area the user opened before the change, when the change came from a cockpit tile. */
  readonly area: TileId | null
}

interface YearMemory {
  midpoint: number | null
  area: TileId | null
  effect: Effect | null
}

const memory = new Map<number, YearMemory>()

function forYear(year: number): YearMemory {
  let entry = memory.get(year)
  if (entry === undefined) {
    entry = { midpoint: null, area: null, effect: null }
    memory.set(year, entry)
  }
  return entry
}

/** Remembers which area the user opens, so the next change can be attributed to it. */
export function rememberOpenedArea(year: number, area: TileId): void {
  forYear(year).area = area
}

/**
 * Feeds the latest estimate midpoint (null while there is none). The first figure only sets the
 * baseline; a later, different figure becomes the effect shown until the next change.
 */
export function observeMidpoint(year: number, midpoint: number | null): Effect | null {
  const entry = forYear(year)
  if (midpoint === null) return entry.effect
  if (entry.midpoint !== null && entry.midpoint !== midpoint) {
    entry.effect = { deltaEur: midpoint - entry.midpoint, area: entry.area }
    entry.area = null
  }
  entry.midpoint = midpoint
  return entry.effect
}

export function dismissEffect(year: number): void {
  forYear(year).effect = null
}

/** Tests only: forget everything. */
export function resetEffectMemory(): void {
  memory.clear()
}
