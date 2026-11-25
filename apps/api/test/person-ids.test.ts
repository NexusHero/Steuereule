import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isShadowId, ownerOf, personIds, shadowIdOf } from '../src/common/person-ids.js'
import { maxTaxYear, MIN_TAX_YEAR } from '../src/common/tax-year.js'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

describe('the shadow id of a Person B without an own login', () => {
  it('covers every tax year a route accepts, by the same clock the routes use', () => {
    // 31 December 23:30 UTC is already the new year in Berlin: the routes accept one year more.
    const newYearsEveUtc = new Date('2026-12-31T23:30:00Z')
    const ids = personIds('user-1', newYearsEveUtc)
    expect(ids).toContain(shadowIdOf('user-1', MIN_TAX_YEAR))
    expect(ids).toContain(shadowIdOf('user-1', maxTaxYear(newYearsEveUtc)))
    expect(maxTaxYear(newYearsEveUtc)).toBe(2028)
  })

  it('reads back what it writes', () => {
    const id = shadowIdOf('abc_123', 2025)
    expect(isShadowId(id)).toBe(true)
    expect(ownerOf(id)).toBe('abc_123')
    expect(isShadowId('abc_123')).toBe(false)
  })

  it('has one definition: no other source file spells the prefix', () => {
    const spelled = sourceFiles(SRC)
      .filter((file) => /['"]spouse_/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file))
    expect(spelled).toEqual(['common/person-ids.ts'])
  })
})
