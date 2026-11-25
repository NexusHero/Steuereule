import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Prisma applies migrations in the order of their folder names. Two folders with the same timestamp are then
// ordered by the rest of their name, which nobody chose. Three pairs on main predate this rule and are kept as they
// are (they are applied everywhere); every later migration has a timestamp of its own.
const GRANDFATHERED = new Set(['20261024090000', '20261024100000', '20261122100000'])

describe('migration order', () => {
  it('gives every migration since the beta-readiness change a timestamp of its own', () => {
    const folders = readdirSync(fileURLToPath(new URL('../prisma/migrations', import.meta.url))).filter((name) => /^\d{14}_/.test(name))
    const seen = new Map<string, string[]>()
    for (const folder of folders) {
      const stamp = folder.slice(0, 14)
      seen.set(stamp, [...(seen.get(stamp) ?? []), folder])
    }
    const duplicates = [...seen].filter(([stamp, names]) => names.length > 1 && !GRANDFATHERED.has(stamp)).map(([, names]) => names)
    expect(duplicates).toEqual([])
  })
})
