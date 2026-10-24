// The persistence seam for the Rentner guided mask (product ADR-034, Anlage R, ticket 10.4).
// RenteService depends on this interface, not on Prisma directly, so unit tests can swap in a fake
// that still honours the real per-(userId, steuerjahr) uniqueness (ADR-0004) — mirrors
// LstbRepository/ChLohnausweisRepository.
//
// The record carries only the persisted FACTS: the rentenart discriminator (nullable, plain) and
// the three field strings, where `null` is `offen`, the reserved marker `unklar` is "looked but
// could not read", and any other string is a non-negative integer (`erfasst`) — the ONE encoding
// defined in packages/core/src/rente.ts. The derived taxable share and the fold (renteStand) are
// computed by @steuereule/core on every read, never stored (ADR-014/048 determinism boundary).
import type { RentenFeldId } from '@steuereule/core'

export interface RenteRecord {
  userId: string
  steuerjahr: number
  /** One of rente.ts's five `Rentenart` values, null = not yet chosen. */
  rentenart: string | null
  /** Jahresbetrag der Rente (whole euros) — null=offen, "unklar"=unreadable. */
  jahresbetrag: string | null
  /** Jahr des Rentenbeginns — same encoding. */
  rentenbeginnJahr: string | null
  /** Vollendetes Lebensjahr bei Rentenbeginn — same encoding. */
  alterBeiRentenbeginn: string | null
}

export const RENTE_REPOSITORY = Symbol('RENTE_REPOSITORY')

export interface RenteRepository {
  /** The caller's Rente row, or null when none exists yet (never a fabricated empty row). */
  findForUserAndYear(userId: string, steuerjahr: number): Promise<RenteRecord | null>
  /**
   * Upsert one field's stored string, scoped to (userId, steuerjahr). Appends the row's WRITE
   * audit entry (REQ-004) atomically with the upsert — mirrors PrismaLstbRepository.
   */
  setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, wert: string | null): Promise<RenteRecord>
  /** Upsert the rentenart discriminator (null = not yet chosen), scoped to (userId, steuerjahr). */
  setRentenart(userId: string, steuerjahr: number, art: string | null): Promise<RenteRecord>
}
