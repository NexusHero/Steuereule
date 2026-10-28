// ADR-0050 — the checked-in Vordruck templates are pinned: every field position the
// Ausdruck draws is measured against one exact file, so a template swapped without
// re-measuring (a newer Formularstand, the wrong year) must go red here, not print
// figures into the wrong boxes.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import manifest from '../src/ausdruck/vordrucke-2025.json' with { type: 'json' }

const DIR = new URL('../assets/vordrucke/2025/', import.meta.url)

describe('Vordruck-Vorlagen 2025', () => {
  it.each(Object.entries(manifest))('%s matches its pinned hash', (_name, eintrag) => {
    const sha256 = createHash('sha256').update(readFileSync(new URL(eintrag.datei, DIR))).digest('hex')
    expect(sha256).toBe(eintrag.sha256)
  })

  it('every template file is in the manifest, and every manifest entry has a file', () => {
    const dateien = readdirSync(DIR).filter((name) => name.endsWith('.pdf')).sort()
    expect(dateien).toEqual(Object.values(manifest).map((eintrag) => eintrag.datei).sort())
  })

  it('every page carries a 2025 form key — the year is the one the rules are written for', () => {
    for (const eintrag of Object.values(manifest)) {
      expect(eintrag.formularschluessel.length).toBeGreaterThan(0)
      for (const schluessel of eintrag.formularschluessel) expect(schluessel).toMatch(/^2025.+NET$/)
    }
  })
})
