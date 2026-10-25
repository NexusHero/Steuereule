// The persistence seam for the Jahresübernahme-Kennzeichnung (ticket 10.8, Produkt-ADR-021).
// UebernahmeService depends on this interface, not on Prisma directly, so unit tests can swap in
// a fake that still honours the real (userId, steuerjahr, postenKey) uniqueness — mirrors
// LstbRepository/RenteRepository. The Kennzeichnung is the GENERIC layer: which fact was copied
// from which Vorjahr, and whether the user has confirmed it yet. The facts themselves stay in
// their own models; M1 carries only the `lstb` key (the other verticals are named follow-ups).
export interface UebernahmeKennzeichnungRecord {
  userId: string
  steuerjahr: number
  vorjahr: number
  postenKey: string
  bestaetigt: boolean
}

export const UEBERNAHME_REPOSITORY = Symbol('UEBERNAHME_REPOSITORY')

export interface UebernahmeRepository {
  /** All Kennzeichnungen of the caller's target year, oldest first. */
  listForUserAndYear(userId: string, steuerjahr: number): Promise<UebernahmeKennzeichnungRecord[]>
  /** One Kennzeichnung, or null when the key was never copied into that year. */
  findForUserAndYearAndKey(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null>
  /** Create a Kennzeichnung (bestaetigt=false) — the copy's marker. */
  create(userId: string, steuerjahr: number, vorjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord>
  /** Mark one Kennzeichnung confirmed (ADR-021: angetippt/Beleg deckt sie). Null when none exists. */
  bestaetige(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeKennzeichnungRecord | null>
}
