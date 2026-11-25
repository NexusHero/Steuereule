// The payment provider guarantees neither the order of its events nor that each comes once. The status of an
// unlock must therefore depend on WHICH events arrived, never on their order: every order and every
// repetition of a set of events ends in the same status.
import { describe, expect, it } from 'vitest'
import { applyUnlockFact, NO_UNLOCK_FACTS, unlockStatusOf, type UnlockFact } from '../src/unlock/unlock-lifecycle.js'

const at = new Date('2026-03-01T10:00:00Z')
const FACTS: Record<string, UnlockFact> = {
  paid: { kind: 'paid', at },
  closed: { kind: 'closed' },
  refunded: { kind: 'refunded', at },
  disputed: { kind: 'disputed' },
  won: { kind: 'dispute-won' },
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
}

function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((all, item) => [...all, ...all.map((set) => [...set, item])], [[]])
}

const statusAfter = (names: readonly string[]) => unlockStatusOf(names.reduce((facts, name) => applyUnlockFact(facts, FACTS[name]!), NO_UNLOCK_FACTS))

describe('unlock lifecycle', () => {
  it('every order of every set of events ends in the same status, also with each event delivered twice', () => {
    for (const set of subsets(Object.keys(FACTS))) {
      const expected = statusAfter(set)
      for (const order of permutations(set)) {
        expect(statusAfter(order), order.join(' → ')).toBe(expected)
        expect(statusAfter([...order, ...order]), `${order.join(' → ')}, redelivered`).toBe(expected)
      }
    }
  })

  it('only a payment that is neither refunded nor under a pending dispute unlocks', () => {
    for (const set of subsets(Object.keys(FACTS))) {
      const unlocks = set.includes('paid') && !set.includes('refunded') && (!set.includes('disputed') || set.includes('won'))
      expect(statusAfter(set) === 'bezahlt', set.join(', ')).toBe(unlocks)
    }
  })

  it('names what happened', () => {
    expect(statusAfter([])).toBe('offen')
    expect(statusAfter(['closed'])).toBe('abgelaufen')
    expect(statusAfter(['closed', 'paid'])).toBe('bezahlt')
    expect(statusAfter(['paid', 'disputed'])).toBe('angefochten')
    expect(statusAfter(['paid', 'disputed', 'won', 'refunded'])).toBe('erstattet')
  })
})
