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
    }
    this.store.set(k, record)
    return Promise.resolve(record)
  }

  setPersonB(id: string, personBUserId: string): Promise<PartnerCouplingRecord> {
    for (const [k, r] of this.store.entries()) {
      if (r.id === id) {
        const updated = { ...r, personBUserId, invitationCode: null, invitationCodeValidUntil: null }
        this.store.set(k, updated)
        return Promise.resolve(updated)
      }
    }
    throw new Error('Not found')
  }

  delete(personAUserId: string, taxYear: number): Promise<boolean> {
    const k = key(personAUserId, taxYear)
    const exists = this.store.has(k)
    this.store.delete(k)
    return Promise.resolve(exists)
  }
}
