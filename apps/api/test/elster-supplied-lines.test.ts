// ADR-0101 §22: Anlage S/G get their Zeilen from a checked file read off Mein ELSTER; a broken file is skipped.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearSuppliedLines, elsterLinesFor } from '@steuereule/core'
import { loadSuppliedElsterLines } from '../src/business/elster-supplied-lines.js'

const quiet = { warn: () => {} } as never

describe('Anlage S/G lines from Mein ELSTER', () => {
  afterEach(() => clearSuppliedLines())

  it('loads a valid file and skips a broken one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'elster-lines-'))
    writeFileSync(join(dir, 'anlage-s-2025.json'), JSON.stringify({ form: 'anlage-s', year: 2025, source: 'Mein ELSTER, Anlage S 2025, abgelesen am 21.11.2026', lines: [{ id: 'anlage-s.gewinn', zeile: '4', kennzahlen: ['100'], label: 'Gewinn' }] }))
    writeFileSync(join(dir, 'anlage-g-2025.json'), '{ kaputt')
    expect(loadSuppliedElsterLines(dir, quiet)).toBe(1)
    expect(elsterLinesFor('anlage-s', 2025).status).toBe('published')
    expect(elsterLinesFor('anlage-g', 2025).status).toBe('not_available')
  })

  it('loads nothing without the folder', () => {
    expect(loadSuppliedElsterLines(join(tmpdir(), 'gibt-es-nicht-elster'), quiet)).toBe(0)
  })
})
