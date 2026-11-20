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
  /** Liable to church tax or not, set without the confession (ADR-0052 amendment 3); absent = not said. */
  kirchensteuerpflichtig?: boolean | null
}

export const MASTER_DATA_REPOSITORY = Symbol('MASTER_DATA_REPOSITORY')

/** Persistence seam for the Erklärungs-Stammdaten / master data. */
export interface MasterDataRepository {
  findByUserId(userId: string): Promise<MasterDataRecord | null>
  save(userId: string, record: MasterDataRecord): Promise<MasterDataRecord>
}

/**
 * The religion key the return prints: the confession the user entered, or `VD` (none) when only „not
 * liable to church tax“ is known (ADR-0052 amendment 3). „Liable“ without a confession stays open: the
 * form needs the church.
 */
export function religionForReturn(record: Pick<MasterDataRecord, 'religion' | 'kirchensteuerpflichtig'> | null | undefined): string | null {
  if (record?.religion) return record.religion
  return record?.kirchensteuerpflichtig === false ? 'VD' : null
}
