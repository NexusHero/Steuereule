// The persistence seam for the CH-Lohnausweis guided mask (ADR-036, Grenzgänger-CH vertical,
// ticket 16). ChLohnausweisService depends on this interface, not on Prisma directly, so unit
// tests can swap in a fake that still honours the real per-(userId, steuerjahr) uniqueness
// (ADR-0004: no mocking Prisma into meaninglessness) — mirrors LstbRepository/ProfileRepository.
//
// The record carries only the persisted FACTS: the 15 Lohnausweis field strings (where `null` is
// `offen`, the reserved marker `unklar` is "looked but could not read", and any other string is a
// whole-CHF amount — the ONE encoding defined in packages/core/src/grenzgaenger.ts), the optional
// Säule 3a / Krankenkasse amounts (same encoding), and the Wechselkurs columns. The derived fold
// (grenzgaengerStand) is computed by @steuereule/core on every read, never stored
// (ADR-014/048 determinism boundary).
import type { LohnausweisBetragFeldId } from '@steuereule/core'

/** The 14 CHF-betrag Lohnausweis fields' stored strings, keyed by field id. */
export type ChLohnausweisFelder = Record<LohnausweisBetragFeldId, string | null>

export interface ChLohnausweisRecord {
  userId: string
  steuerjahr: number
  felder: ChLohnausweisFelder
  /** Ziffer 15 — Bemerkungen (Freitext), null when not entered. */
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  wechselkursMonat: string | null
  wechselkursKurs: number | null
  wechselkursModus: string | null
  wechselkursBelegId: string | null
}

export const CH_LOHNAUSWEIS_REPOSITORY = Symbol('CH_LOHNAUSWEIS_REPOSITORY')

export interface ChLohnausweisRepository {
  /** The caller's CH-Lohnausweis row, or null when none exists yet (never a fabricated empty row). */
  findForUserAndYear(userId: string, steuerjahr: number): Promise<ChLohnausweisRecord | null>
  /**
   * Upsert one Lohnausweis CHF field's stored string, scoped to (userId, steuerjahr). Appends the
   * row's WRITE audit entry (REQ-004) atomically with the upsert — mirrors PrismaLstbRepository.
   */
  setFeld(userId: string, steuerjahr: number, feld: LohnausweisBetragFeldId, wert: string | null): Promise<ChLohnausweisRecord>
  /** Upsert the Bemerkungen Freitext (null = not entered), scoped to (userId, steuerjahr). */
  setBemerkungen(userId: string, steuerjahr: number, text: string | null): Promise<ChLohnausweisRecord>
  /** Upsert the optional Säule 3a and Krankenkasse amounts (null = not entered), scoped to (userId, steuerjahr). */
  setVorsorge(userId: string, steuerjahr: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<ChLohnausweisRecord>
  /** Upsert the Wechselkurs (monat/kurs/modus/belegId), scoped to (userId, steuerjahr). */
  setWechselkurs(
    userId: string,
    steuerjahr: number,
    wechselkurs: { monat: string; kurs: number; modus: string; belegId?: string },
  ): Promise<ChLohnausweisRecord>
}
