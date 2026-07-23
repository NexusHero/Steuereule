// In-memory fake that actually honours per-userId scoping/uniqueness — a Map keyed by
// userId can only ever hold one record per userId, so round-trip and cross-user
// isolation are genuinely exercised (ADR-0004: not a mock that echoes back whatever it
// was fed). Mirrors PrismaProfileRepository's createdAt/updatedAt behaviour (a fresh
// createdAt on first insert, a bumped updatedAt on every write) so REQ-011 export
// tests built against this fake see the same shape a real Postgres row would.
import type { ProfileRecord, ProfileRepository } from '../../src/profile/profile.repository.js'

export class FakeProfileRepository implements ProfileRepository {
  private readonly store = new Map<string, ProfileRecord>()

  findByUserId(userId: string): Promise<ProfileRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  upsert(userId: string, data: ProfileRecord): Promise<ProfileRecord> {
    const existing = this.store.get(userId)
    const now = new Date()
    const record: ProfileRecord = { ...data, createdAt: existing?.createdAt ?? now, updatedAt: now }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }

  userCount(): number {
    return this.store.size
  }
}
