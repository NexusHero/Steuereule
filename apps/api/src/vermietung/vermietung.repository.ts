// The persistence seam for the Vermietung guided mask (ticket 10.6, product ADR-033,
// Anlage V einfach). VermietungService depends on this interface, not on Prisma directly, so
// unit tests can swap in a fake that still honours the real (userId, steuerjahr, id) scoping
// (ADR-0004) — mirrors LstbRepository/ChLohnausweisRepository/RenteRepository.
//
// One row per OBJECT (several ganzjährig vermietete objects, each its own Anlage V). Each field
// string encodes its honest state: `null` = `offen`, the reserved marker `unklar` = "looked but
// could not read", any other string = a non-negative integer (`erfasst`) — the ONE encoding
// defined in packages/core/src/vermietung.ts. The derived facts (Einnahme-Posten,
// Werbungskosten-Summe, lineare AfA) are computed by @steuereule/core on every read, never
// stored (ADR-014/048 determinism boundary).
import type { VermietungFeldId } from '@steuereule/core'

export interface VermietungsobjektRecord {
  id: string
  userId: string
  steuerjahr: number
  /** Jahreskaltmiete (whole euros) — null=offen, "unklar"=unreadable. */
  mieteinnahmen: string | null
  /** Gebäude-Anschaffungskosten (whole euros) — same encoding. */
  anschaffungskosten: string | null
  /** Baujahr (Fertigstellung) — same encoding. */
  baujahr: string | null
  /** Laufende Werbungskosten (whole euros) — same encoding. */
  werbungskosten: string | null
}

export const VERMIETUNG_REPOSITORY = Symbol('VERMIETUNG_REPOSITORY')

export interface VermietungRepository {
  /** The caller's objects for the year, oldest first — empty when none exist yet (never fabricated). */
  listForUserAndYear(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord[]>
  /**
   * Create a fresh object (all four fields `offen`) scoped to (userId, steuerjahr). Appends the
   * row's WRITE audit entry (REQ-004) atomically with the create.
   */
  create(userId: string, steuerjahr: number): Promise<VermietungsobjektRecord>
  /**
   * Upsert one field's stored string on the object `objektId`, scoped to (userId, steuerjahr).
   * Returns null when no such object exists (never a cross-user read). Appends the WRITE audit
   * entry atomically.
   */
  setFeld(userId: string, steuerjahr: number, objektId: string, feld: VermietungFeldId, wert: string | null): Promise<VermietungsobjektRecord | null>
}
