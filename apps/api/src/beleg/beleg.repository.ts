// The persistence seam for Beleg (ADR-007/008). BelegService depends on this interface,
// not on Prisma directly, so unit tests can swap in a fake that still honours the real
// per-userId scoping (ADR-0004: no mocking Prisma into meaninglessness) — mirrors
// ProfileRepository. The record carries only the persisted FACTS; the derived
// Zuordnung state (ungebunden/vorgeschlagen/zugeordnet/konflikt) is computed by
// @steuereule/core's `zuordnungAusDaten`, never stored (ADR-014/048).
export interface BelegRecord {
  id: string
  userId: string
  dateiname: string
  /** Invoice date, ISO yyyy-mm-dd (absent when not yet extracted). */
  belegdatum?: string
  /** Payment date, ISO yyyy-mm-dd — § 11 Zufluss fixes the year, not the invoice date. */
  zahlungsdatum?: string
  /** The CONFIRMED year; null while unbound/suggested. */
  steuerjahr: number | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateBelegData {
  dateiname: string
  belegdatum?: string
  zahlungsdatum?: string
}

export const BELEG_REPOSITORY = Symbol('BELEG_REPOSITORY')

export interface BelegRepository {
  /** All of the caller's Belege, newest first (the inbox). */
  findAllForUser(userId: string): Promise<BelegRecord[]>
  /** One Beleg, scoped to its owner; null when it belongs to someone else or doesn't exist. */
  findByIdForUser(userId: string, id: string): Promise<BelegRecord | null>
  /** Create an unbound Beleg, appending its WRITE audit entry atomically (REQ-004). */
  create(userId: string, data: CreateBelegData): Promise<BelegRecord>
  /** Set the confirmed year, appending its WRITE audit entry atomically (REQ-004). */
  setSteuerjahr(userId: string, id: string, steuerjahr: number): Promise<BelegRecord | null>
}
