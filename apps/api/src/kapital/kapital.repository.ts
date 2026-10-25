// The persistence seam for the Kapital guided mask (ticket 10.5, product ADR-032, Anlage KAP).
// KapitalService depends on this interface, not on Prisma directly, so unit tests can swap in a
// fake that still honours the real per-(userId, steuerjahr) uniqueness (ADR-0004) — mirrors
// LstbRepository/ChLohnausweisRepository/RenteRepository.
//
// The record carries only the persisted FACT: the kapitalertraege field string, where `null` is
// `offen`, the reserved marker `unklar` is "looked but could not read", and any other string is
// a non-negative integer (`erfasst`) — the ONE encoding defined in packages/core/src/kapital.ts.
// The derived Posten, the fold (kapitalStand) and the § 32d Abs. 6 Günstigerprüfung are computed
// by @steuereule/core on every read, never stored (ADR-014/048 determinism boundary). The depot
// kind is NOT persisted here — it is the interview answer `kap-depot`, read through the interview
// repository (one source, no denormalized copy).
import type { KapitalFeldId } from '@steuereule/core'

export interface KapitalRecord {
  userId: string
  steuerjahr: number
  /** Kapitalerträge (whole euros) — null=offen, "unklar"=unreadable. */
  kapitalertraege: string | null
}

export const KAPITAL_REPOSITORY = Symbol('KAPITAL_REPOSITORY')

export interface KapitalRepository {
  /** The caller's Kapital row, or null when none exists yet (never a fabricated empty row). */
  findForUserAndYear(userId: string, steuerjahr: number): Promise<KapitalRecord | null>
  /**
   * Upsert one field's stored string, scoped to (userId, steuerjahr). Appends the row's WRITE
   * audit entry (REQ-004) atomically with the upsert — mirrors PrismaRenteRepository.
   */
  setFeld(userId: string, steuerjahr: number, feld: KapitalFeldId, wert: string | null): Promise<KapitalRecord>
}
