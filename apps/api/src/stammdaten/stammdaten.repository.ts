// Persistence seam for the Erklärungs-Stammdaten (ADR-0050). The service depends on
// this interface so unit tests run against an in-memory fake (ADR-0004).

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

export interface StammdatenRepository {
  /** null when nothing was saved yet — never a fabricated empty row. */
  findByUserId(userId: string): Promise<StammdatenRecord | null>
  /** Full replace; appends the WRITE audit entry atomically with the row (REQ-004). */
  speichere(userId: string, record: StammdatenRecord): Promise<StammdatenRecord>
}
