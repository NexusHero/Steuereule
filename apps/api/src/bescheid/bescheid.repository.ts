// The persistence seam for the Steuerbescheid (Bescheidprüfung 1.0, ticket 10.3, ADR-009).
// BescheidService depends on this interface, not on Prisma directly, so unit tests can swap in a
// fake that still honours the real per-(userId, steuerjahr) uniqueness (ADR-0004: no mocking
// Prisma into meaninglessness) — mirrors LstbRepository/BelegRepository.
//
// The record carries only the persisted FACTS: the five figure strings (where `null` is `offen`,
// the reserved marker `unklar` is "looked but could not read", and any other string is a
// whole-euro amount — the ONE encoding defined in packages/core/src/bescheid.ts), the phase
// sub-state, the Bescheiddatum and the Einspruch-Grund. The derived Abgleich (gleicheBescheidAb)
// and the Fristen-Countdown (einspruchsfristEnde) are computed by @steuereule/core on every read,
// never stored (ADR-014/048 determinism boundary).
import type { BescheidFeld, BescheidStatus } from '@steuereule/core'

export type BescheidFelder = Record<BescheidFeld, string | null>

export interface BescheidRecord {
  userId: string
  steuerjahr: number
  /** The bescheid-phase sub-state (eingegangen | geprüft | einspruch-eingelegt). */
  status: BescheidStatus
  /** ISO yyyy-mm-dd, null until the Bescheid arrives. */
  bescheiddatum: string | null
  /** Einspruch-Grund (closed set), null until an Einspruch is filed. */
  einspruchGrund: string | null
  /** The five figures' stored strings, keyed by field id. */
  felder: BescheidFelder
}

export const BESCHEID_REPOSITORY = Symbol('BESCHEID_REPOSITORY')

export interface BescheidRepository {
  /** The caller's Bescheid row, or null when none exists yet (never a fabricated empty row). */
  findForUserAndYear(userId: string, steuerjahr: number): Promise<BescheidRecord | null>
  /** Upsert one figure's stored string, scoped to (userId, steuerjahr). Appends a WRITE audit entry. */
  setFeld(userId: string, steuerjahr: number, feld: BescheidFeld, wert: string | null): Promise<BescheidRecord>
  /** Upsert the Bescheiddatum (null = cleared), scoped to (userId, steuerjahr). */
  setDatum(userId: string, steuerjahr: number, datum: string | null): Promise<BescheidRecord>
  /** Persist a status write (the service already validated the transition). */
  setStatus(userId: string, steuerjahr: number, status: BescheidStatus): Promise<BescheidRecord>
  /** Persist the Einspruch (status → einspruch-eingelegt + the Grund). */
  setEinspruch(userId: string, steuerjahr: number, grund: string): Promise<BescheidRecord>
}
