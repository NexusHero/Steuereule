import { describe, expect, it } from 'vitest'
import { deutschZuIso, isoZuDeutsch, zuEntwurf, zuPutDto } from './stammdatenMapping'

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
  fehlend: [],
}

describe('date mapping', () => {
  it('shows ISO dates the German way and reads German dates back as ISO, padding single digits', () => {
    expect(isoZuDeutsch('1990-04-12')).toBe('12.04.1990')
    expect(deutschZuIso('12.4.1990')).toBe('1990-04-12')
    expect(deutschZuIso(' ')).toBeNull()
  })

  it('passes an unparseable date through so the API rejects it visibly, never drops it', () => {
    expect(deutschZuIso('1990')).toBe('1990')
  })
})

describe('form round trip', () => {
  it('an empty record becomes an empty form and back to all-null (no fabricated values)', () => {
    const dto = zuPutDto(zuEntwurf(LEER))
    expect(Object.entries(dto).filter(([key, value]) => key !== 'religionEinwilligung' && value !== null)).toEqual([])
    expect(dto.religionEinwilligung).toBe(false)
  })

  it('a stored religion starts with its consent ticked; ledig drops any "seit" date', () => {
    const entwurf = zuEntwurf({ ...LEER, religion: 'EV', familienstand: 'ledig' })
    expect(entwurf.religionEinwilligung).toBe(true)
    expect(zuPutDto({ ...entwurf, familienstandSeit: '01.01.2020' }).familienstandSeit).toBeNull()
  })
})
