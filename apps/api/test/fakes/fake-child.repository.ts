import type { ChildDetails, ChildRecord, ChildRepository } from '../../src/children/child.repository.js'

function key(userId: string, taxYear: number): string {
  return `${userId}::${taxYear}`
}

export class FakeChildRepository implements ChildRepository {
  private readonly store = new Map<string, ChildRecord>()
  private counter = 0

  listForUserAndYear(userId: string, taxYear: number): Promise<ChildRecord[]> {
    const k = key(userId, taxYear)
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => key(r.userId, r.taxYear) === k)
        .sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    )
  }

  listAllForUser(userId: string): Promise<ChildRecord[]> {
    return Promise.resolve(
      [...this.store.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => a.taxYear - b.taxYear || a.sequenceNumber - b.sequenceNumber),
    )
  }

  create(
    userId: string,
    taxYear: number,
    data: {
      firstName: string
      lastName: string
      geburtsdatum: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord> {
    this.counter += 1
    const current = [...this.store.values()].filter((r) => key(r.userId, r.taxYear) === key(userId, taxYear))
    const record: ChildRecord = {
      id: `fake-kind-${this.counter}`,
      userId,
      taxYear,
      sequenceNumber: current.length + 1,
      firstName: data.firstName,
      lastName: data.lastName,
      geburtsdatum: data.geburtsdatum,
      taxId: data.taxId ?? null,
      childBenefitClaimEur: data.childBenefitClaimEur ?? null,
      kinship: data.kinship ?? null,
      kinshipB: data.kinshipB ?? null,
      familyBenefitsOffice: data.familyBenefitsOffice ?? null,
      domesticResidenceAllYear: data.domesticResidenceAllYear ?? null,
      otherParent: data.otherParent ?? null,
      otherParentName: data.otherParentName ?? null,
      otherParentBirthDate: data.otherParentBirthDate ?? null,
      otherParentAddress: data.otherParentAddress ?? null,
      otherParentKind: data.otherParentKind ?? null,
      otherParentDiedOn: data.otherParentDiedOn ?? null,
      registeredWithMeAllYear: data.registeredWithMeAllYear ?? null,
      childBenefitToMeAllYear: data.childBenefitToMeAllYear ?? null,
      healthBasicEur: data.healthBasicEur ?? null,
      careEur: data.careEur ?? null,
      swissFamilyAllowanceEur: data.swissFamilyAllowanceEur ?? null,
      childcareEur: data.childcareEur ?? null,
      childcareProvider: data.childcareProvider ?? null,
      childcareFrom: data.childcareFrom ?? null,
      childcareTo: data.childcareTo ?? null,
    }
    this.store.set(record.id, record)
    return Promise.resolve(record)
  }

  update(
    userId: string,
    taxYear: number,
    id: string,
    data: {
      firstName?: string
      lastName?: string
      geburtsdatum?: string
      taxId?: string | null
      childBenefitClaimEur?: string | null
    } & Partial<ChildDetails>,
  ): Promise<ChildRecord | null> {
    const record = this.store.get(id)
    if (!record || record.userId !== userId || record.taxYear !== taxYear) return Promise.resolve(null)
    const details = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
    const updated: ChildRecord = { ...record, ...details }
    this.store.set(id, updated)
    return Promise.resolve(updated)
  }

  delete(userId: string, taxYear: number, id: string): Promise<boolean> {
    const record = this.store.get(id)
    if (!record || record.userId !== userId || record.taxYear !== taxYear) return Promise.resolve(false)
    this.store.delete(id)
    return Promise.resolve(true)
  }
}
