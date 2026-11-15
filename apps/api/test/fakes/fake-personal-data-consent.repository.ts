import type { PersonalDataConsentRecord, PersonalDataConsentRepository } from '../../src/owl-mode/personal-data-consent.repository.js'

export class FakePersonalDataConsentRepository implements PersonalDataConsentRepository {
  private readonly store = new Map<string, PersonalDataConsentRecord>()

  findByUserId(userId: string): Promise<PersonalDataConsentRecord | null> {
    return Promise.resolve(this.store.get(userId) ?? null)
  }

  grant(userId: string, version: string, at: Date): Promise<PersonalDataConsentRecord> {
    const record: PersonalDataConsentRecord = { userId, version, grantedAt: at, revokedAt: null }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }

  revoke(userId: string, at: Date): Promise<PersonalDataConsentRecord | null> {
    const current = this.store.get(userId)
    if (!current) return Promise.resolve(null)
    const record = { ...current, revokedAt: at }
    this.store.set(userId, record)
    return Promise.resolve(record)
  }
}
