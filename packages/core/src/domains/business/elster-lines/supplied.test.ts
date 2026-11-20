import { afterEach, describe, expect, it } from 'vitest'
import { elsterLinesFor } from './catalogue'
import { clearSuppliedLines, parseSuppliedLines, registerSuppliedLines } from './supplied'

const FILE = JSON.stringify({
  form: 'anlage-g',
  year: 2025,
  source: 'Mein ELSTER, Anlage G 2025, abgelesen am 21.11.2026',
  lines: [
    { id: 'anlage-g.gewinn', zeile: '4', kennzahlen: ['110'], label: 'Gewinn aus Gewerbebetrieb' },
    { id: 'anlage-g.messbetrag', zeile: '15', kennzahlen: ['140'], label: 'Steuermessbetrag' },
  ],
})

describe('Anlage S/G lines read off Mein ELSTER (ADR-0101 §22)', () => {
  afterEach(() => clearSuppliedLines())

  it('stays not_available without a file, and published with a checked one', () => {
    expect(elsterLinesFor('anlage-g', 2025)).toEqual({ status: 'not_available', reason: 'electronic_only' })
    const parsed = parseSuppliedLines(FILE)
    if (!parsed.ok) throw new Error(parsed.errors.join())
    registerSuppliedLines(parsed.supplied)
    const lines = elsterLinesFor('anlage-g', 2025)
    expect(lines).toMatchObject({ status: 'published', source: { url: 'Mein ELSTER, Anlage G 2025, abgelesen am 21.11.2026' } })
    if (lines.status !== 'published') return
    expect(lines.lines.map((l) => [l.id, l.zeile, l.kennzahlen])).toEqual([['anlage-g.gewinn', '4', ['110']], ['anlage-g.messbetrag', '15', ['140']]])
    expect(elsterLinesFor('anlage-g', 2024).status).toBe('not_available')
  })

  it('refuses a file with an unknown value, a bad Zeile or no source', () => {
    const bad = parseSuppliedLines(JSON.stringify({ form: 'anlage-g', year: 2025, source: 'x', lines: [{ id: 'anlage-g.erfunden', zeile: 'vier', kennzahlen: ['1'], label: '' }] }))
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.errors.join(' ')).toMatch(/source/)
    expect(bad.errors.join(' ')).toMatch(/anlage-g.gewinn/)
    expect(bad.errors.join(' ')).toMatch(/Zeilennummer/)
    expect(parseSuppliedLines('{').ok).toBe(false)
  })
})
