import type { PartnerCouplingRecord, PartnerCouplingRepository } from '../../src/link/link.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeLinkRepository implements PartnerCouplingRepository {
  private readonly store = new Map<string, PartnerCouplingRecord>()
  private counter = 0

  findByUserAndYear(userId: string, taxYear: number): Promise<PartnerCouplingRecord | null> {
    for (const r of this.store.values()) {
      if (r.taxYear === taxYear && (r.personAUserId === userId || r.personBUserId === userId)) {
        return Promise.resolve(r)
      }
    }
    return Promise.resolve(null)
  }

  listForPersonA(personAUserId: string): Promise<PartnerCouplingRecord[]> {
    return Promise.resolve([...this.store.values()].filter((r) => r.personAUserId === personAUserId).sort((a, b) => a.taxYear - b.taxYear))
  }

  findByInvitationCode(code: string): Promise<PartnerCouplingRecord | null> {
    for (const r of this.store.values()) {
      if (r.invitationCode === code) return Promise.resolve(r)
    }
    return Promise.resolve(null)
  }

  upsert(
    personAUserId: string,
    taxYear: number,
    data: {
      personBUserId: string
      filingType: 'einzel' | 'zusammen'
      invitationCode?: string | null
      invitationCodeValidUntil?: Date | null
      personBConsentedAt?: Date | null
    },
  ): Promise<PartnerCouplingRecord> {
    const k = key(personAUserId, taxYear)
    const existing = this.store.get(k)
    const id = existing?.id ?? `fake-kopplung-${++this.counter}`
    const record: PartnerCouplingRecord = {
      id,
      personAUserId,
      personBUserId: data.personBUserId,
      taxYear,
      filingType: data.filingType,
      invitationCode: data.invitationCode ?? null,
      invitationCodeValidUntil: data.invitationCodeValidUntil ?? null,
      personBConsentedAt: data.personBConsentedAt !== undefined ? data.personBConsentedAt : existing?.personBUserId === data.personBUserId ? (existing.personBConsentedAt ?? null) : null,
    }
    this.store.set(k, record)
    return Promise.resolve(record)
  }

  claimInvitation(code: string, taxYear: number, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null> {
    for (const [k, r] of this.store.entries()) {
      if (r.invitationCode === code && r.taxYear === taxYear && r.invitationCodeValidUntil !== null && r.invitationCodeValidUntil > now) {
        const updated = { ...r, personBUserId, invitationCode: null, invitationCodeValidUntil: null, personBConsentedAt: now }
        this.store.set(k, updated)
        return Promise.resolve(updated)
      }
    }
    return Promise.resolve(null)
  }

  withdrawPersonBConsent(id: string, personBUserId: string): Promise<PartnerCouplingRecord | null> {
    for (const [k, r] of this.store.entries()) {
      if (r.id === id && r.personBUserId === personBUserId) {
        const updated = { ...r, personBConsentedAt: null }
        this.store.set(k, updated)
        return Promise.resolve(updated)
      }
    }
    return Promise.resolve(null)
  }

  recordPersonBConsent(id: string, personBUserId: string, now: Date): Promise<PartnerCouplingRecord | null> {
    for (const [k, r] of this.store.entries()) {
      if (r.id === id && r.personBUserId === personBUserId) {
        const updated = { ...r, personBConsentedAt: now }
        this.store.set(k, updated)
        return Promise.resolve(updated)
      }
    }
    return Promise.resolve(null)
  }

  delete(personAUserId: string, taxYear: number): Promise<boolean> {
    const k = key(personAUserId, taxYear)
    const exists = this.store.has(k)
    this.store.delete(k)
    return Promise.resolve(exists)
  }
}
