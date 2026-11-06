import { describe, expect, it } from 'vitest'
import { germanToIso, isoToGerman, toDraft, zuPutDto } from './stammdatenMapping'

const LEER = {
  geburtsdatum: null,
  strasse: null,
  hausnummer: null,
  hausnummerZusatz: null,
  plz: null,
  wohnort: null,
  beruf: null,
  religion: null,
  familienstand: null,
  familienstandSeit: null,
  iban: null,
  kontoinhaber: null,
  finanzamt: null,
  telefon: null,
  missing: [],
}

describe('date mapping', () => {
  it('shows ISO dates the German way and reads German dates back as ISO, padding single digits', () => {
    expect(isoToGerman('1990-04-12')).toBe('12.04.1990')
    expect(germanToIso('12.4.1990')).toBe('1990-04-12')
    expect(germanToIso(' ')).toBeNull()
  })

  it('passes an unparseable date through so the API rejects it visibly, never drops it', () => {
    expect(germanToIso('1990')).toBe('1990')
  })
})

describe('form round trip', () => {
  it('an empty record becomes an empty form and back to all-null (no fabricated values)', () => {
    const dto = zuPutDto(toDraft(LEER))
    expect(Object.entries(dto).filter(([key, value]) => key !== 'religionConsent' && value !== null)).toEqual([])
    expect(dto.religionConsent).toBe(false)
  })

  it('a stored religion starts with its consent ticked; ledig drops any "seit" date', () => {
    const draft = toDraft({ ...LEER, religion: 'EV', familienstand: 'ledig' })
    expect(draft.religionConsent).toBe(true)
    expect(zuPutDto({ ...draft, familienstandSeit: '01.01.2020' }).familienstandSeit).toBeNull()
  })
})
