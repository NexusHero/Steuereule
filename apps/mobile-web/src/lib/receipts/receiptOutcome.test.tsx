import type { ParseReceiptResponseDto, ReceiptResponseDto } from '@steuereule/api-client'
import { describe, expect, it } from 'vitest'
import { canReadAgain, filledFieldsByYear, germanDayOf, otherYearOf, outcomeOfFailure, outcomeOfParse, outcomeOfReceipt, type ReceiptOutcome } from './receiptOutcome'

const processing = { state: 'vorschlaege', reason: null, pending: 2, applied: 1, draftsTaxYear: 2025 }

describe('outcomeOfReceipt', () => {
  it('takes the server-derived state of the stored Beleg, including its duplicate hint', () => {
    const duplicateOf = { fileName: 'a.pdf', uploadedAt: '2026-11-18T10:00:00Z' }
    const outcome = outcomeOfReceipt({ processing, duplicateOf } as unknown as ReceiptResponseDto)
    expect(outcome).toEqual({ ...processing, duplicateOf })
  })
})

describe('outcomeOfParse', () => {
  it('prefers the server state and the year of this very read', () => {
    const outcome = outcomeOfParse({ processing, filedInTaxYear: 2024, draftsTaxYear: 2023 } as unknown as ParseReceiptResponseDto)
    expect(outcome).toMatchObject({ state: 'vorschlaege', pending: 2, applied: 1, draftsTaxYear: 2024, duplicateOf: null })
  })

  it('falls back to the draft year, then to the one recorded on the Beleg', () => {
    expect(outcomeOfParse({ processing, draftsTaxYear: 2023 } as unknown as ParseReceiptResponseDto).draftsTaxYear).toBe(2023)
    expect(outcomeOfParse({ processing } as unknown as ParseReceiptResponseDto).draftsTaxYear).toBe(2025)
    expect(outcomeOfParse({ processing: { ...processing, draftsTaxYear: null } } as unknown as ParseReceiptResponseDto).draftsTaxYear).toBeNull()
  })

  it('counts the staged LStB actions when the server recorded nothing', () => {
    expect(outcomeOfParse({ lstb: { stagedActionIds: ['a', 'b', 'c'] } } as unknown as ParseReceiptResponseDto)).toMatchObject({ state: 'vorschlaege', pending: 3 })
  })

  it('counts one staged action', () => {
    expect(outcomeOfParse({ stagedAction: { id: 'x' } } as unknown as ParseReceiptResponseDto)).toMatchObject({ state: 'vorschlaege', pending: 1, reason: null })
  })

  it('reports nothing usable, with the reason of the read or a duplicate or „nichts erkannt“', () => {
    expect(outcomeOfParse({ noValuesReason: 'fremdes_jahr' } as unknown as ParseReceiptResponseDto)).toMatchObject({ state: 'nichts_verwertbar', reason: 'fremdes_jahr', pending: 0 })
    const duplicateOf = { fileName: 'a.pdf', uploadedAt: '2026-11-18T10:00:00Z' }
    expect(outcomeOfParse({ duplicateOf } as unknown as ParseReceiptResponseDto)).toMatchObject({ reason: 'dublette', duplicateOf })
    expect(outcomeOfParse({} as unknown as ParseReceiptResponseDto)).toMatchObject({ reason: 'nichts_erkannt' })
  })
})

describe('outcomeOfFailure', () => {
  it.each([
    ['unsupported_file', 'nicht_unterstuetzt'],
    ['read_failed', 'unlesbar'],
    ['empty_text', 'kein_text'],
    ['parse_failed', 'lesefehler'],
  ] as const)('maps %s to the user-facing reason %s', (failure, reason) => {
    expect(outcomeOfFailure(failure)).toMatchObject({ state: 'nicht_lesbar', reason, pending: 0, duplicateOf: null })
  })

  it('shows the recorded state when the server did record one', () => {
    expect(outcomeOfFailure('parse_failed', processing as never)).toMatchObject({ state: 'vorschlaege', pending: 2, duplicateOf: null })
  })
})

describe('otherYearOf / canReadAgain', () => {
  const base: ReceiptOutcome = { state: 'neu', reason: null, pending: 0, applied: 0, draftsTaxYear: null, duplicateOf: null }

  it('offers a year switch only for drafts that sit in another year', () => {
    expect(otherYearOf({ ...base, draftsTaxYear: 2024 }, 2025)).toBe(2024)
    expect(otherYearOf({ ...base, draftsTaxYear: 2025 }, 2025)).toBeNull()
    expect(otherYearOf(base, 2025)).toBeNull()
  })

  it('lets a Beleg be read again while it is new or unreadable, not once it has suggestions', () => {
    expect(canReadAgain({ ...base, state: 'neu' })).toBe(true)
    expect(canReadAgain({ ...base, state: 'nicht_lesbar' })).toBe(true)
    expect(canReadAgain({ ...base, state: 'vorschlaege' })).toBe(false)
  })
})

describe('filledFieldsByYear / germanDayOf', () => {
  it('groups the filled values by tax year in ascending order', () => {
    const groups = filledFieldsByYear([
      { taxYear: 2025, screen: 'interview', field: 'spenden-betrag', label: 'Spenden', value: '3135' },
      { taxYear: 2024, screen: 'interview', field: 'spenden-betrag', label: 'Spenden', value: '100' },
      { taxYear: 2025, screen: 'interview', field: 'fortbildung-kosten', label: 'Fortbildung', value: '50' },
    ] as never)
    expect(groups.map((g) => g.taxYear)).toEqual([2024, 2025])
    expect(groups[1]?.values).toHaveLength(2)
    expect(groups[1]?.values[0]).toContain('Spenden')
  })

  it('formats an ISO timestamp as a German day and keeps non-dates as they came', () => {
    expect(germanDayOf('2026-11-18T10:00:00Z')).toBe('18.11.2026')
    expect(germanDayOf('gestern')).toBe('gestern')
  })
})
