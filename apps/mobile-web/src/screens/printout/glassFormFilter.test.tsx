// countRows / visibleSectionsFor — the chip count and what a chip shows.
import { describe, expect, it } from 'vitest'
import { ALL_SECTIONS, countRows, visibleSectionsFor } from './glassFormFilter'
import type { GlassFormRow, GlassFormSection } from './glassFormTypes'

const row = (id: string): GlassFormRow => ({ id, line: 'Zeile 1', label: id, value: '1 €', provenanceLabel: 'Selbst eingetragen', screen: 'interview' })
const section = (formId: string, rows: number): GlassFormSection => ({
  formId,
  title: formId,
  subtitle: '',
  rows: Array.from({ length: rows }, (_, i) => row(`${formId}-${i}`)),
})

describe('countRows', () => {
  it('adds the rows of every section', () => {
    expect(countRows([section('est1a', 2), section('anlageN', 3)])).toBe(5)
    expect(countRows([])).toBe(0)
  })
})

describe('visibleSectionsFor', () => {
  const sections = [section('est1a', 1), section('anlageN', 1)]

  it('shows every section under the all chip', () => {
    expect(visibleSectionsFor(sections, ALL_SECTIONS)).toBe(sections)
  })

  it('shows only the chosen Vordruck', () => {
    expect(visibleSectionsFor(sections, 'anlageN').map((s) => s.formId)).toEqual(['anlageN'])
  })

  it('shows nothing for a Vordruck that has no section', () => {
    expect(visibleSectionsFor(sections, 'anlageR')).toEqual([])
  })
})
