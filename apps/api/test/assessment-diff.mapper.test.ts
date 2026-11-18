// ADR-0098 §8 — the wire form of the Bescheid-Abgleich: every row carries the receipt's short reason,
// derived in the core from the Finanzamt's explanation, null where no pattern fits or nothing was said.
import { describe, expect, it } from 'vitest'
import { diffAssessment } from '@steuereule/core'
import { toDiffDto } from '../src/assessment/assessment-diff.mapper.js'

const diff = diffAssessment(
  {
    year: 2024,
    filingType: 'einzel',
    positions: { bruttoarbeitslohnA: 54_900, homeofficeA: 1_260, arbeitsmittelA: 380, fahrtwegA: 1_320, zuVersteuerndesEinkommen: 40_000, festgesetzteSteuer: 8_000, anrechnung: 8_500, erstattung: 500 },
  },
  {
    positions: { bruttoarbeitslohnA: 54_900, homeofficeA: 1_080, arbeitsmittelA: 260, fahrtwegA: 990, zuVersteuerndesEinkommen: 40_610, festgesetzteSteuer: 8_190, anrechnung: 8_500, erstattung: 310 },
    explanations: [
      { position: 'homeofficeA', text: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.' },
      { position: 'arbeitsmittelA', text: 'Aufwendungen für das Mobiltelefon wurden wegen privater Mitbenutzung zu 50 % anerkannt.' },
      { position: 'fahrtwegA', text: 'Die Berechnung wurde von Amts wegen geändert.' },
    ],
  },
)

describe('toDiffDto', () => {
  it('gives every own deviation its short reason, null where no pattern fits', () => {
    const dto = toDiffDto(diff)
    const reasons = Object.fromEntries(dto.ownDeviations.map((d) => [d.position, d.shortReason]))
    expect(reasons).toEqual({ homeofficeA: '180 statt 210 Tage', arbeitsmittelA: 'Handy nur zu 50 %', fahrtwegA: null })
  })

  it('gives the rows of the form view the same short reason, null without an explanation', () => {
    const rows = toDiffDto(diff).groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.position === 'homeofficeA')?.shortReason).toBe('180 statt 210 Tage')
    expect(rows.find((r) => r.position === 'bruttoarbeitslohnA')?.shortReason).toBeNull()
    expect(rows.every((r) => 'shortReason' in r)).toBe(true)
  })
})
