// kindSection / kapSection / rentalSection / renteSection — the rows of children, capital, rental and pension.
import { describe, expect, it } from 'vitest'
import type { KapitalResponseDto, ChildrenResponseDto, PensionResponseDto, RentalResponseDto } from '@steuereule/api-client'
import { kapSection, kindSection, rentalSection, renteSection } from './glassFormAssetRows'
import type { GlassRowContext } from './glassFormTypes'

const ctx = (isJoint: boolean): GlassRowContext => ({
  year: 2025,
  isJoint,
  partnerName: 'Jonas',
  tr: (key) => key,
  prov: (screen, field) => `${screen}.${field ?? ''}`,
})
const ids = (section: { rows: readonly { id: string }[] } | null) => section?.rows.map((r) => r.id) ?? []

describe('kindSection', () => {
  it('is no section without children', () => {
    expect(kindSection(null, ctx(false))).toBeNull()
    expect(kindSection({ kinder: [] } as unknown as ChildrenResponseDto, ctx(false))).toBeNull()
  })

  it('puts KV and PV in Z. 27/28, and a foreign insurer together in Kz 89', () => {
    const children = {
      kinder: [
        { id: 'k1', firstName: 'Mia', lastName: null, geburtsdatum: '2018-03-01', childBenefitClaimEur: '3060', healthBasicEur: '400', careEur: '60', childcareEur: '1200', healthInsuranceAbroad: false },
        { id: 'k2', firstName: null, lastName: null, healthBasicEur: '300', careEur: '50', healthInsuranceAbroad: true },
      ],
    } as unknown as ChildrenResponseDto
    const section = kindSection(children, ctx(false))
    expect(section?.title).toBe('Anlage Kind (2×)')
    expect(ids(section)).toEqual(['kind-k1-stamm', 'kind-k1-kv', 'kind-k1-pv', 'kind-k1-betreuung', 'kind-k2-stamm', 'kind-k2-ausland'])
    expect(section?.rows[0]?.label).toBe('Mia (*2018-03-01)')
    expect(section?.rows[4]?.label).toBe('Kind 2')
    expect(section?.rows[4]?.value).toContain('Kindergeld: 0')
  })
})

describe('kapSection', () => {
  it('names the holder, or the household on a joint return', () => {
    const cap = {
      kapitalertraege: { kind: 'erfasst', value: 1500 },
      sparerPauschbetrag: { kind: 'erfasst', value: 1000 },
      kapitalertragsteuer: { kind: 'offen' },
      inhaber: null,
    } as unknown as KapitalResponseDto
    const section = kapSection(cap, ctx(true))
    expect(ids(section)).toEqual(['kap-ertraege', 'kap-pauschbetrag'])
    expect(section?.rows[0]?.person).toBe('gemeinsam')
    expect(kapSection({ ...cap, inhaber: 'B' } as unknown as KapitalResponseDto, ctx(true))?.rows[0]?.person).toBe('B')
  })
})

describe('rentalSection', () => {
  it('names each object by its address and the shares of the spouses', () => {
    const rental = {
      properties: [{ id: 'o1', strasse: 'Hauptstr.', hausnummer: '1', city: 'Basel', mieteinnahmen: { kind: 'erfasst', value: 9000 }, werbungskosten: { kind: 'offen' }, anteilA: '60' }],
    } as unknown as RentalResponseDto
    const section = rentalSection(rental, ctx(true))
    expect(ids(section)).toEqual(['v-o1-miete', 'v-o1-anteil'])
    expect(section?.rows[0]?.label).toBe('Kaltmieteinnahmen (Hauptstr. 1 Basel)')
    expect(section?.rows[1]?.value).toBe('60 % / 40 %')
  })

  it('is no section while no object has a value', () => {
    const rental = { properties: [{ id: 'o1', mieteinnahmen: { kind: 'offen' }, werbungskosten: { kind: 'offen' }, anteilA: null }] } as unknown as RentalResponseDto
    expect(rentalSection(rental, ctx(false))).toBeNull()
  })
})

describe('renteSection', () => {
  const pension = { jahresbetrag: { kind: 'erfasst', value: 14000 } } as unknown as PensionResponseDto

  it("adds Person B's pension only on a joint return", () => {
    expect(ids(renteSection(pension, pension, ctx(false)))).toEqual(['rente-a'])
    expect(ids(renteSection(pension, pension, ctx(true)))).toEqual(['rente-a', 'rente-b'])
    expect(renteSection(null, null, ctx(true))).toBeNull()
  })
})
