// The persistence seam for Profile. ProfileService depends on this interface, not on
// Prisma directly, so unit tests can swap in a fake that still honours the real
// per-userId uniqueness constraint (ADR-0004: no mocking Prisma into meaninglessness).
export interface ProfileRecord {
  firstName: string
  lastName: string
  steuerId: string
  steuernummer: string | null
  /**
   * Row timestamps — optional because the write side (ProfileService.saveProfile's
   * upsert payload) never sets them; Prisma's own `@default(now())`/`@updatedAt` own
   * these, not the caller. `findByUserId`'s read always populates them. Added for
   * REQ-011's DSGVO export (ADR-0013), which needs the account holder's own
   * Profile.createdAt/updatedAt in the export document — existing callers
   * (ProfileService) are unaffected since neither field is required.
   */
  createdAt?: Date
  updatedAt?: Date
}

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY')

export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileRecord | null>
  /** Idempotent upsert scoped to userId — the same payload written twice yields the same stored state. */
  upsert(userId: string, data: ProfileRecord): Promise<ProfileRecord>
}
