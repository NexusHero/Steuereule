import type {
  PutMasterDataDto,
  PutMasterDataDtoFamilienstand,
  PutMasterDataDtoReligion,
  MasterDataResponseDto,
} from '@steuereule/api-client'
import { formatIban, isIsoDate, normalizeIban, toGermanDate, toIsoDate } from '@steuereule/core'

export interface MasterDataDraft {
  geburtsdatum: string
  strasse: string
  hausnummer: string
  hausnummerZusatz: string
  plz: string
  wohnort: string
  beruf: string
  religion: string | null
  religionConsent: boolean
  familienstand: string | null
  familienstandSeit: string
  iban: string
  kontoinhaber: string
  finanzamt: string
  telefon: string
}

/** A stored `YYYY-MM-DD` as the field shows it (`TT.MM.JJJJ`); empty for anything else. */
export function isoToGerman(iso: string | null): string {
  return iso !== null && isIsoDate(iso) ? (toGermanDate(iso) ?? '') : ''
}

/** What the user typed as `YYYY-MM-DD`; text that is no real date goes on unchanged so the API names the problem. */
export function germanToIso(input: string): string | null {
  const value = input.trim()
  if (value === '') return null
  return toIsoDate(value) ?? value
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function toDraft(status: MasterDataResponseDto): MasterDataDraft {
  return {
    geburtsdatum: isoToGerman(status.geburtsdatum),
    strasse: status.strasse ?? '',
    hausnummer: status.hausnummer ?? '',
    hausnummerZusatz: status.hausnummerZusatz ?? '',
    plz: status.plz ?? '',
    wohnort: status.wohnort ?? '',
    beruf: status.beruf ?? '',
    religion: status.religion,
    religionConsent: status.religion !== null,
    familienstand: status.familienstand,
    familienstandSeit: isoToGerman(status.familienstandSeit),
    iban: formatIban(status.iban ?? ''),
    kontoinhaber: status.kontoinhaber ?? '',
    finanzamt: status.finanzamt ?? '',
    telefon: status.telefon ?? '',
  }
}

export function zuPutDto(draft: MasterDataDraft): PutMasterDataDto {
  return {
    geburtsdatum: germanToIso(draft.geburtsdatum),
    strasse: emptyToNull(draft.strasse),
    hausnummer: emptyToNull(draft.hausnummer),
    hausnummerZusatz: emptyToNull(draft.hausnummerZusatz),
    plz: emptyToNull(draft.plz),
    wohnort: emptyToNull(draft.wohnort),
    beruf: emptyToNull(draft.beruf),
    religion: draft.religion as PutMasterDataDtoReligion,
    religionConsent: draft.religionConsent,
    familienstand: draft.familienstand as PutMasterDataDtoFamilienstand,
    familienstandSeit: draft.familienstand === 'ledig' ? null : germanToIso(draft.familienstandSeit),
    iban: emptyToNull(normalizeIban(draft.iban)),
    kontoinhaber: emptyToNull(draft.kontoinhaber),
    finanzamt: emptyToNull(draft.finanzamt),
    telefon: emptyToNull(draft.telefon),
  }
}
