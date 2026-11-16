import { describe, expect, it } from 'vitest'
import { acroEditSpec, parseWholeAmount } from './acroFieldEditing'

describe('acroEditSpec', () => {
  it('marks only exact 1:1 fields as directly editable', () => {
    expect(acroEditSpec('anlN.kz110')).toEqual({ kind: 'direct', endpoint: 'lstb', field: 'bruttoarbeitslohn', person: 'A', unit: 'EUR' })
    expect(acroEditSpec('anlN.kz140')).toEqual({ kind: 'direct', endpoint: 'lstb', field: 'lohnsteuer', person: 'A', unit: 'EUR' })
    expect(acroEditSpec('anlNGre.z6Chf')).toMatchObject({ kind: 'direct', endpoint: 'ch', field: 'grossWageChf', unit: 'CHF' })
    expect(acroEditSpec('anlKap.kz210')).toMatchObject({ kind: 'direct', endpoint: 'kapital', field: 'kapitalertraege' })
    expect(acroEditSpec('anlR.kz101')).toMatchObject({ kind: 'direct', endpoint: 'rente', field: 'jahresbetrag' })
  })

  it('ignores the instance suffix of repeated fields', () => {
    expect(acroEditSpec('anlN.kz110#0')).toMatchObject({ kind: 'direct', field: 'bruttoarbeitslohn' })
  })

  it('never falls back to a guessed target: unknown fields of a known form are not editable', () => {
    // maskTargetForAcroField maps these to bruttoarbeitslohn / jahresbetrag for navigation; writing there would corrupt data.
    expect(acroEditSpec('anlN.kz999')).toBeNull()
    expect(acroEditSpec('anlR.rentenbeginn')).toBeNull()
    expect(acroEditSpec('anlKap.kz280')).toBeNull()
    expect(acroEditSpec('est1a.strasse')).toBeNull()
  })

  it('marks computed and summed fields as derived with a hint about their sources', () => {
    for (const id of ['anlN.kz380', 'anlN.kz110Tage', 'anlV.werbungskostenSumme', 'anlV.ueberschuss', 'anlKind.kindergeld', 'anlKap.kz217']) {
      const spec = acroEditSpec(id)
      expect(spec?.kind, id).toBe('derived')
      expect(spec?.kind === 'derived' && spec.sources.length > 0, id).toBe(true)
    }
  })
})

describe('parseWholeAmount', () => {
  it('accepts plain and German-grouped whole amounts', () => {
    expect(parseWholeAmount('68500')).toEqual({ kind: 'value', value: 68500 })
    expect(parseWholeAmount(' 68.500 ')).toEqual({ kind: 'value', value: 68500 })
    expect(parseWholeAmount('1.234.567')).toEqual({ kind: 'value', value: 1234567 })
    expect(parseWholeAmount('68.500,00')).toEqual({ kind: 'value', value: 68500 })
    expect(parseWholeAmount('0')).toEqual({ kind: 'value', value: 0 })
  })

  it('treats an empty input as clearing the value', () => {
    expect(parseWholeAmount('')).toEqual({ kind: 'empty' })
    expect(parseWholeAmount('   ')).toEqual({ kind: 'empty' })
  })

  it('rejects cents, negatives, text and ambiguous separators instead of guessing', () => {
    for (const raw of ['68,5', '68.500,50', '-100', 'abc', '1.5', '12.34', '1e5', '68 500']) {
      expect(parseWholeAmount(raw).kind, raw).toBe('invalid')
    }
  })
})
