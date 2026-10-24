// The persistence seam for the LStB guided mask (ADR-036, ticket 08). LstbService depends
// on this interface, not on Prisma directly, so unit tests can swap in a fake that still
// honours the real per-(userId, steuerjahr) uniqueness (ADR-0004: no mocking Prisma into
// meaninglessness) — mirrors ProfileRepository/BelegRepository.
//
// The record carries only the persisted FACTS: three nullable strings, where `null` is
// `offen`, the reserved marker `unklar` is "looked but could not read", and any other
// string is a whole-euro amount (`erfasst`) — the ONE encoding defined in
// packages/core/src/lstb.ts. The derived `LstbZustand` (unvollstaendig / widerspruch /
// vollstaendig) is computed by @steuereule/core's `lstbZustand`, never stored
// (ADR-014/048 determinism boundary) — a stored copy of a derivable state could only drift.
import type { LstbFeldId } from '@steuereule/core'

export interface LstbRecord {
  userId: string
  steuerjahr: number
  /** Bruttoarbeitslohn (Zeile 3) — null = offen, "unklar" = unreadable, else a decimal amount. */
  bruttoarbeitslohn: string | null
  /** Einbehaltene Lohnsteuer (Zeile 4) — same encoding. */
  lohnsteuer: string | null
  /** Arbeitnehmer-Anteil der SV-Beiträge (Zeilen 22/23) — same encoding. */
  sozialversicherung: string | null
}

export const LSTB_REPOSITORY = Symbol('LSTB_REPOSITORY')

export interface LstbRepository {
  /** The caller's LStB row, or null when none exists yet (never a fabricated empty row). */
  findForUserAndYear(userId: string, steuerjahr: number): Promise<LstbRecord | null>
  /**
   * Upsert one field's stored string, scoped to (userId, steuerjahr). Appends the row's
   * WRITE audit entry (REQ-004) atomically with the upsert — mirrors PrismaBelegRepository.
   */
  setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, wert: string | null): Promise<LstbRecord>
}
