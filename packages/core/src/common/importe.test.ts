// The app bundles packages/core from source with Metro, which resolves `./x` but not `./x.js`
// onto a .ts file — a value import with the suffix passes tsc and vitest and only breaks the
// Expo web build (it did: kinder.ts → './stammdaten.js'). Type-only imports are erased, so fine.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SRC = new URL('.', import.meta.url)

describe('packages/core imports', () => {
  it('has no value import of a sibling with a .js suffix (Metro cannot resolve it)', () => {
    const hits = readdirSync(SRC)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .flatMap((file) =>
        readFileSync(new URL(file, SRC), 'utf8')
          .split('\n')
          .filter((row) => /^import\s+(?!type\b)[^;]*from\s+'\.\/[^']+\.js'/.test(row))
          .map((row) => `${file}: ${row}`),
      )
    expect(hits).toEqual([])
  })
})
