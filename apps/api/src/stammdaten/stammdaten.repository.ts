export const MASTER_DATA_FIELDS = [
  'geburtsdatum',
  'strasse',
  'hausnummer',
  'hausnummerZusatz',
  'plz',
  'wohnort',
  'beruf',
  'religion',
  'familienstand',
  'familienstandSeit',
  'iban',
  'kontoinhaber',
  'finanzamt',
  'telefon',
] as const

export const STAMMDATEN_FELDER = MASTER_DATA_FIELDS

export type MasterDataField = (typeof MASTER_DATA_FIELDS)[number]
export type StammdatenFeld = MasterDataField

export type MasterDataValues = Record<MasterDataField, string | null>
export type StammdatenWerte = MasterDataValues

export interface MasterDataRecord extends MasterDataValues {
  religionEinwilligungAm: Date | null
}
export type StammdatenRecord = MasterDataRecord

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY')
export const STAMMDATEN_REPOSITORY = MASTER_DATA_REPOSITORY

/** Persistence seam for the Erklärungs-Stammdaten / master data. */
export interface MasterDataRepository {
  findByUserId(userId: string): Promise<MasterDataRecord | null>
  save?(userId: string, record: MasterDataRecord): Promise<MasterDataRecord>
  speichere(userId: string, record: StammdatenRecord): Promise<StammdatenRecord>
}
export type StammdatenRepository = MasterDataRepository
