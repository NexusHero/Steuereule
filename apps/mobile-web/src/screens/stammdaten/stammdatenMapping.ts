// Form ↔ API mapping for the Erklärungs-Stammdaten (ADR-0050). Users type dates the
// German way (TT.MM.JJJJ); the API stores ISO (YYYY-MM-DD) — the form never shows ISO.
import type {
  PutStammdatenDto,
  PutStammdatenDtoFamilienstand,
  PutStammdatenDtoReligion,
  StammdatenResponseDto,
} from '@steuereule/api-client'

export interface StammdatenEntwurf {
  geburtsdatum: string
  strasse: string
  hausnummer: string
  hausnummerZusatz: string
  plz: string
  wohnort: string
  beruf: string
  religion: string | null
  religionEinwilligung: boolean
  familienstand: string | null
  familienstandSeit: string
  iban: string
  kontoinhaber: string
  finanzamt: string
  telefon: string
}

export function isoZuDeutsch(iso: string | null): string {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

/** "12.4.1990" → "1990-04-12"; anything unparseable is passed through so the API's
 *  date rule rejects it with a visible error instead of the form silently dropping it. */
export function deutschZuIso(eingabe: string): string | null {
  const wert = eingabe.trim()
  if (wert === '') return null
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(wert)
  if (!match) return wert
  return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
}

function leerZuNull(wert: string): string | null {
  const getrimmt = wert.trim()
  return getrimmt === '' ? null : getrimmt
}

export function zuEntwurf(stand: StammdatenResponseDto): StammdatenEntwurf {
  return {
    geburtsdatum: isoZuDeutsch(stand.geburtsdatum),
    strasse: stand.strasse ?? '',
    hausnummer: stand.hausnummer ?? '',
    hausnummerZusatz: stand.hausnummerZusatz ?? '',
    plz: stand.plz ?? '',
    wohnort: stand.wohnort ?? '',
    beruf: stand.beruf ?? '',
    religion: stand.religion,
    // A stored religion was stored with consent; the box starts ticked for it.
    religionEinwilligung: stand.religion !== null,
    familienstand: stand.familienstand,
    familienstandSeit: isoZuDeutsch(stand.familienstandSeit),
    iban: stand.iban ?? '',
    kontoinhaber: stand.kontoinhaber ?? '',
    finanzamt: stand.finanzamt ?? '',
    telefon: stand.telefon ?? '',
  }
}

export function zuPutDto(entwurf: StammdatenEntwurf): PutStammdatenDto {
  return {
    geburtsdatum: deutschZuIso(entwurf.geburtsdatum),
    strasse: leerZuNull(entwurf.strasse),
    hausnummer: leerZuNull(entwurf.hausnummer),
    hausnummerZusatz: leerZuNull(entwurf.hausnummerZusatz),
    plz: leerZuNull(entwurf.plz),
    wohnort: leerZuNull(entwurf.wohnort),
    beruf: leerZuNull(entwurf.beruf),
    religion: entwurf.religion as PutStammdatenDtoReligion,
    religionEinwilligung: entwurf.religionEinwilligung,
    familienstand: entwurf.familienstand as PutStammdatenDtoFamilienstand,
    familienstandSeit: entwurf.familienstand === 'ledig' ? null : deutschZuIso(entwurf.familienstandSeit),
    iban: leerZuNull(entwurf.iban),
    kontoinhaber: leerZuNull(entwurf.kontoinhaber),
    finanzamt: leerZuNull(entwurf.finanzamt),
    telefon: leerZuNull(entwurf.telefon),
  }
}
