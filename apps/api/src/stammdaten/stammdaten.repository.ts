export const STAMMDATEN_FELDER = [
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

export type StammdatenFeld = (typeof STAMMDATEN_FELDER)[number]

export type StammdatenWerte = Record<StammdatenFeld, string | null>

export interface StammdatenRecord extends StammdatenWerte {
  religionEinwilligungAm: Date | null
}

export const STAMMDATEN_REPOSITORY = Symbol('STAMMDATEN_REPOSITORY')

/** Persistence seam for the Erklärungs-Stammdaten. */
export interface StammdatenRepository {
  findByUserId(userId: string): Promise<StammdatenRecord | null>
  speichere(userId: string, record: StammdatenRecord): Promise<StammdatenRecord>
}
