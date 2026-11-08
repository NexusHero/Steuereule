// ADR-0050 — the checked-in Vordruck templates are pinned: every field position the
// Ausdruck draws is measured against one exact file, so a template swapped without
// re-measuring (a newer Formularstand, the wrong year) must go red here, not print
// figures into the wrong boxes.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest2022 from '../src/printout/vordrucke-2022.json' with { type: 'json' }
import manifest2023 from '../src/printout/vordrucke-2023.json' with { type: 'json' }
import manifest2024 from '../src/printout/vordrucke-2024.json' with { type: 'json' }
import manifest2025 from '../src/printout/vordrucke-2025.json' with { type: 'json' }

const MANIFESTS = [
  { year: 2022, manifest: manifest2022 },
  { year: 2023, manifest: manifest2023 },
  { year: 2024, manifest: manifest2024 },
  { year: 2025, manifest: manifest2025 },
] as const

describe('Vordruck-Vorlagen (2022–2025)', () => {
  for (const { year, manifest } of MANIFESTS) {
    const dir = new URL(`../assets/vordrucke/${year}/`, import.meta.url)

    describe(`Steuerjahr ${year}`, () => {
      it.each(Object.entries(manifest))('%s matches its pinned hash', (_name, entry) => {
        const sha256 = createHash('sha256').update(readFileSync(new URL(entry.datei, dir))).digest('hex')
        expect(sha256).toBe(entry.sha256)
      })

      it('every template file is in the manifest, and every manifest entry has a file', () => {
        const files = readdirSync(dir).filter((name) => name.endsWith('.pdf')).sort()
        expect(files).toEqual(Object.values(manifest).map((entry) => entry.datei).sort())
        expect(files.length).toBe(18)
      })

      it(`every page carries a ${year} form key — the year is the one the rules are written for`, () => {
        const keyPattern = new RegExp(`^${year}.+NET$`)
        for (const entry of Object.values(manifest)) {
          expect(entry.formularschluessel.length).toBeGreaterThan(0)
          for (const key of entry.formularschluessel) {
            expect(key).toMatch(keyPattern)
          }
        }
      })
    })
  }
})
