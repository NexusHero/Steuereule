import type {
  PutMasterDataDto,
  PutMasterDataDtoFamilienstand,
  PutMasterDataDtoReligion,
  MasterDataResponseDto,
} from '@steuereule/api-client'
import { formatIban, normalizeIban } from '@steuereule/core'

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

export function isoToGerman(iso: string | null): string {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  return match ? `${match[3]}.${match[2]}.${match[1]}` : ''
}

export function germanToIso(input: string): string | null {
  const value = input.trim()
  if (value === '') return null
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)
  if (!match) return value
  return `${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`
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
