import { describe, expect, it } from 'vitest'
import type { MasterDataResponseDto } from '@steuereule/api-client'
import { derivePersonas } from './personas'

function md(familienstand: MasterDataResponseDto['familienstand']): MasterDataResponseDto {
  return {
    geburtsdatum: null,
    strasse: null,
    hausnummer: null,
    hausnummerZusatz: null,
    plz: null,
    wohnort: null,
    beruf: null,
    religion: null,
    familienstand,
    familienstandSeit: null,
    iban: null,
    kontoinhaber: null,
    finanzamt: null,
    telefon: null,
    missing: [],
  }
}

describe('derivePersonas (§ 5.1)', () => {
  it('derives angestellt for Angestellt or Beides when not working in Switzerland', () => {
    expect([...derivePersonas({ job: 'Angestellt', ausland: 'Nein' })]).toContain('angestellt')
    expect([...derivePersonas({ job: 'Beides', ausland: 'In ein anderes Land' })]).toContain('angestellt')
    expect([...derivePersonas({ job: 'Angestellt', ausland: 'Ja, in die Schweiz' })]).not.toContain('angestellt')
    expect([...derivePersonas({ job: 'Rente', ausland: 'Nein' })]).not.toContain('angestellt')
  })

  it('derives grenzgaenger when ausland is Ja, in die Schweiz', () => {
    expect([...derivePersonas({ job: 'Angestellt', ausland: 'Ja, in die Schweiz' })]).toEqual(['grenzgaenger'])
  })

  it('derives rentner when job is Rente', () => {
    expect([...derivePersonas({ job: 'Rente', ausland: 'Nein' })]).toEqual(['rentner'])
  })

  it('derives vermieter when einkuenfte is Vermietung or Beides', () => {
    expect(derivePersonas({ job: 'Angestellt', einkuenfte: 'Vermietung' }).has('vermieter')).toBe(true)
    expect(derivePersonas({ job: 'Angestellt', einkuenfte: 'Beides' }).has('vermieter')).toBe(true)
    expect(derivePersonas({ job: 'Angestellt', einkuenfte: 'Kapitalerträge' }).has('vermieter')).toBe(false)
    expect(derivePersonas({ job: 'Angestellt', einkuenfte: 'Nein' }).has('vermieter')).toBe(false)
  })

  it('derives verheiratet from interview answer or masterData override', () => {
    expect(derivePersonas({ familienstand: 'Verheiratet' }).has('verheiratet')).toBe(true)
    expect(derivePersonas({ familienstand: 'Ledig' }).has('verheiratet')).toBe(false)
    expect(derivePersonas({ familienstand: 'Ledig' }, md('verheiratet')).has('verheiratet')).toBe(true)
    expect(derivePersonas({ familienstand: 'Verheiratet' }, md('ledig')).has('verheiratet')).toBe(false)
  })

  it('derives eltern when kinder is defined and not Nein', () => {
    expect(derivePersonas({}).has('eltern')).toBe(false)
    expect(derivePersonas({ kinder: 'Nein' }).has('eltern')).toBe(false)
    expect(derivePersonas({ kinder: '1 Kind' }).has('eltern')).toBe(true)
    expect(derivePersonas({ kinder: '2 oder mehr' }).has('eltern')).toBe(true)
  })

  it('derives alleinerziehend when eltern holds and status is single, divorced/separated, or widowed', () => {
    expect(derivePersonas({ kinder: '1 Kind', familienstand: 'Ledig' }).has('alleinerziehend')).toBe(true)
    expect(
      derivePersonas({ kinder: '2 oder mehr', familienstand: 'Geschieden oder getrennt' }).has('alleinerziehend'),
    ).toBe(true)
    expect(derivePersonas({ kinder: '1 Kind', familienstand: 'Verwitwet' }).has('alleinerziehend')).toBe(true)
    expect(derivePersonas({ kinder: '1 Kind', familienstand: 'Verheiratet' }).has('alleinerziehend')).toBe(false)
    expect(derivePersonas({ kinder: 'Nein', familienstand: 'Ledig' }).has('alleinerziehend')).toBe(false)
    expect(derivePersonas({ kinder: '1 Kind', familienstand: 'Verheiratet' }, md('geschieden')).has('alleinerziehend')).toBe(true)
  })
})
