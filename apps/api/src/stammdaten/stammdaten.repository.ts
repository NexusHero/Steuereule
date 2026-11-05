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
export type MasterDataField = (typeof MASTER_DATA_FIELDS)[number]
export type MasterDataValues = Record<MasterDataField, string | null>

export interface MasterDataRecord extends MasterDataValues {
  religionEinwilligungAm: Date | null
}

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY')

/** Persistence seam for the Erklärungs-Stammdaten / master data. */
export interface MasterDataRepository {
  findByUserId(userId: string): Promise<MasterDataRecord | null>
  speichere(userId: string, record: MasterDataRecord): Promise<MasterDataRecord>
}
