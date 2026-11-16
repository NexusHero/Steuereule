import { describe, expect, it } from 'vitest'
import { acroEditSpec, parseAcroInput, parseWholeAmount } from './acroFieldEditing'

describe('acroEditSpec', () => {
  const copy = (person: 'A' | 'B' | null, entityId: string | null = null, copies = 1) => ({ person, entityId, copies })

  it('marks only fields printed exactly as entered as directly editable', () => {
    expect(acroEditSpec('anlN.kz110')).toEqual({ kind: 'direct', endpoint: 'lstb', field: 'bruttoarbeitslohn', person: 'A', unit: 'EUR' })
    expect(acroEditSpec('anlNGre.z6Chf')).toMatchObject({ kind: 'direct', endpoint: 'ch', field: 'grossWageChf', unit: 'CHF' })
    expect(acroEditSpec('anlKap.kz210')).toMatchObject({ kind: 'direct', endpoint: 'kapital', field: 'kapitalertraege' })
    expect(acroEditSpec('anlR.kz101')).toMatchObject({ kind: 'direct', endpoint: 'rente', field: 'jahresbetrag' })
    expect(acroEditSpec('anlR.kz131')).toMatchObject({ kind: 'direct', endpoint: 'rente', field: 'jahresbetrag' })
  })

  it("writes to the person of the copy: Person B's Anlage N goes to B's certificate", () => {
    expect(acroEditSpec('anlN.kz110', copy('B'))).toMatchObject({ kind: 'direct', person: 'B' })
    expect(acroEditSpec('anlNGre.z6Chf', copy('B'))).toMatchObject({ kind: 'direct', person: 'B' })
  })

  it('treats a joint account split onto two Anlagen KAP as computed, not as the stored amount', () => {
    expect(acroEditSpec('anlKap.kz210', copy('A', null, 2))).toMatchObject({ kind: 'derived' })
    expect(acroEditSpec('anlKap.kz210', copy('B', null, 1))).toMatchObject({ kind: 'direct', person: 'B' })
  })

  it('ignores the instance suffix of repeated fields', () => {
    expect(acroEditSpec('anlN.kz110#0')).toMatchObject({ kind: 'direct', field: 'bruttoarbeitslohn' })
  })

  it('never falls back to a guessed target: unknown fields of a known form are not editable', () => {
    // maskTargetForAcroField maps these to bruttoarbeitslohn / jahresbetrag for navigation; writing there would corrupt data.
    expect(acroEditSpec('anlN.kz999')).toBeNull()
    expect(acroEditSpec('anlR.rentenbeginn')).toBeNull()
    expect(acroEditSpec('anlKap.kz280')).toBeNull()
  })

  it('makes address, job and names editable as text, tied to the record of their copy', () => {
    expect(acroEditSpec('est1a.strasse')).toEqual({
      kind: 'text', target: 'stammdaten', field: 'strasse', person: 'A', entityId: null, rule: 'text', required: false,
    })
    expect(acroEditSpec('est1a.plz')).toMatchObject({ kind: 'text', target: 'stammdaten', field: 'plz', rule: 'postalCode' })
    expect(acroEditSpec('est1a.idnrB')).toMatchObject({ kind: 'text', target: 'personB', field: 'steuerId', person: 'B', rule: 'taxId' })
    expect(acroEditSpec('anlKind.vorname', copy(null, 'kind-2'))).toMatchObject({ kind: 'text', target: 'child', entityId: 'kind-2', required: true })
    expect(acroEditSpec('anlV.ort', copy(null, 'obj-9'))).toMatchObject({ kind: 'text', target: 'rental', field: 'city', entityId: 'obj-9' })
  })

  it('does not edit a per-record field when the copy names no record', () => {
    expect(acroEditSpec('anlKind.vorname')).toBeNull()
    expect(acroEditSpec('anlV.plz')).toBeNull()
  })

  it('keeps special-category and checked data in the masks: religion, IBAN, marital status', () => {
    for (const id of ['est1a.religion', 'est1a.religionB', 'est1a.ibanInland', 'est1a.ibanAusland', 'est1a.zusammenveranlagung']) {
      expect(acroEditSpec(id), id).toBeNull()
    }
  })

  it('marks computed and summed fields as derived with a hint about their sources', () => {
    const ids = ['anlN.kz380', 'anlNGre.z82Chf', 'anlNGre.z25Chf', 'anlNGre.z6Eur', 'anlV.strasse', 'anlV.werbungskostenSumme', 'anlKind.kindergeld', 'anlKap.kz217', 'anlVor.kz300']
    for (const id of ids) {
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

describe('parseAcroInput for text fields', () => {
  const spec = (rule: 'text' | 'postalCode' | 'taxId', required = false) =>
    ({ kind: 'text', target: 'stammdaten', field: 'x', person: 'A', entityId: null, rule, required }) as const

  it('trims text and lets optional fields be cleared', () => {
    expect(parseAcroInput(spec('text'), '  Rheinweg ')).toEqual({ kind: 'value', value: 'Rheinweg' })
    expect(parseAcroInput(spec('text'), ' ')).toEqual({ kind: 'empty' })
  })

  it('refuses to clear a required field', () => {
    expect(parseAcroInput(spec('text', true), '')).toEqual({ kind: 'invalid', reason: 'required' })
  })

  it('checks postal codes and tax ids', () => {
    expect(parseAcroInput(spec('postalCode'), '79539')).toEqual({ kind: 'value', value: '79539' })
    expect(parseAcroInput(spec('postalCode'), '7953')).toEqual({ kind: 'invalid', reason: 'postalCode' })
    expect(parseAcroInput(spec('taxId'), '12 345 678 911')).toEqual({ kind: 'value', value: '12345678911' })
    expect(parseAcroInput(spec('taxId'), '1234')).toEqual({ kind: 'invalid', reason: 'taxId' })
  })

  it('rejects overlong text and control characters', () => {
    expect(parseAcroInput(spec('text'), 'x'.repeat(101))).toEqual({ kind: 'invalid', reason: 'text' })
    expect(parseAcroInput(spec('text'), 'a\nb')).toEqual({ kind: 'invalid', reason: 'text' })
  })

  it('parses amounts of direct fields with the amount rule', () => {
    const amount = acroEditSpec('anlN.kz110')
    if (amount?.kind !== 'direct') throw new Error('anlN.kz110 must be a direct field')
    expect(parseAcroInput(amount, '68.500')).toEqual({ kind: 'value', value: 68500 })
    expect(parseAcroInput(amount, '68,5')).toEqual({ kind: 'invalid', reason: 'amount' })
  })
})
