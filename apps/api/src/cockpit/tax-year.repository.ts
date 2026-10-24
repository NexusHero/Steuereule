// The persistence seam for the Cockpit's raw tax-year inputs. CockpitService depends
// on this interface, not on Prisma directly, so unit tests can swap in a fake that
// still honours the real per-(userId, steuerjahr) uniqueness constraint (ADR-0004:
// no mocking Prisma into meaninglessness) — mirrors ProfileRepository.
//
// Ticket 15: the `baseEstimate` Schätz-Platzhalter is gone from this seam — the Cockpit
// now folds the real LStB/interview figures through @steuereule/core, so the only tax-year
// fact this seam still carries is the Minimal-Gate's `openItems` projection (REQ-015).
export interface TaxYearRecord {
  steuerjahr: number
  openItems: number
}

export const TAX_YEAR_REPOSITORY = Symbol('TAX_YEAR_REPOSITORY')

export interface TaxYearRepository {
  /** Null means "no tax year seeded/entered yet" — the honest empty state, never an error. */
  findByUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRecord | null>
}
