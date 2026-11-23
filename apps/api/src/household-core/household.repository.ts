import { randomUUID } from 'node:crypto'

/** A spouse or child kept once per household (ADR-0062). `sealed` holds the stable facts. */
export interface HouseholdPersonRecord {
  readonly id: string
  readonly householdUserId: string
  readonly kind: 'spouse' | 'child'
  readonly sealed: string
  readonly linkedUserId: string | null
  readonly leftFromYear: number | null
  readonly updatedByUserId: string
  readonly updatedAt: Date
}

export interface MembershipRecord {
  readonly id: string
  readonly personId: string
  readonly taxYear: number
  readonly childId: string | null
  readonly spouseUserId: string | null
}

export interface PartnerLinkRecord {
  readonly id: string
  readonly personAUserId: string
  readonly personBUserId: string
  readonly spousePersonId: string | null
  readonly validFromYear: number
  readonly endedFromYear: number | null
}

export interface MergeCandidateRecord {
  readonly id: string
  readonly householdUserId: string
  readonly personId: string
  readonly otherPersonId: string
  readonly resolution: 'same' | 'different' | null
}

export const HOUSEHOLD_REPOSITORY = Symbol('HOUSEHOLD_REPOSITORY')

export interface HouseholdRepository {
  listPersons(householdUserId: string): Promise<HouseholdPersonRecord[]>
  findPerson(id: string): Promise<HouseholdPersonRecord | null>
  createPerson(input: Omit<HouseholdPersonRecord, 'updatedAt' | 'leftFromYear' | 'linkedUserId'> & { linkedUserId?: string | null }): Promise<HouseholdPersonRecord>
  updatePerson(
    id: string,
    patch: Partial<Pick<HouseholdPersonRecord, 'sealed' | 'leftFromYear' | 'linkedUserId' | 'updatedByUserId'>>,
  ): Promise<HouseholdPersonRecord>
  /** Cascades to the person's memberships. */
  deletePerson(id: string): Promise<void>

  listMemberships(householdUserId: string): Promise<MembershipRecord[]>
  findMembershipByChildId(childId: string): Promise<MembershipRecord | null>
  createMembership(input: Omit<MembershipRecord, 'id'>): Promise<MembershipRecord>
  deleteMembership(id: string): Promise<void>
  moveMemberships(fromPersonId: string, toPersonId: string): Promise<void>

  findPartnerLinkByPersonA(personAUserId: string): Promise<PartnerLinkRecord | null>
  findPartnerLinkByPersonB(personBUserId: string): Promise<PartnerLinkRecord | null>
  upsertPartnerLink(personAUserId: string, data: Omit<PartnerLinkRecord, 'id' | 'personAUserId'>): Promise<PartnerLinkRecord>

  listCandidates(householdUserId: string): Promise<MergeCandidateRecord[]>
  /** Ignored when the pair is already known (either order). */
  createCandidate(input: Omit<MergeCandidateRecord, 'id' | 'resolution'>): Promise<void>
  resolveCandidate(id: string, resolution: 'same' | 'different'): Promise<MergeCandidateRecord>
}

/** Same contract in memory: unit tests and the API test harness. */
export class InMemoryHouseholdRepository implements HouseholdRepository {
  readonly persons = new Map<string, HouseholdPersonRecord>()
  readonly memberships = new Map<string, MembershipRecord>()
  readonly links = new Map<string, PartnerLinkRecord>()
  readonly candidates = new Map<string, MergeCandidateRecord>()

  async listPersons(householdUserId: string) {
    return [...this.persons.values()].filter((p) => p.householdUserId === householdUserId)
  }
  async findPerson(id: string) {
    return this.persons.get(id) ?? null
  }
  async createPerson(input: Omit<HouseholdPersonRecord, 'updatedAt' | 'leftFromYear' | 'linkedUserId'> & { linkedUserId?: string | null }) {
    const record: HouseholdPersonRecord = { ...input, linkedUserId: input.linkedUserId ?? null, leftFromYear: null, updatedAt: new Date() }
    this.persons.set(record.id, record)
    return record
  }
  async updatePerson(id: string, patch: Partial<Pick<HouseholdPersonRecord, 'sealed' | 'leftFromYear' | 'linkedUserId' | 'updatedByUserId'>>) {
    const current = this.persons.get(id)
    if (!current) throw new Error(`HouseholdPerson ${id} not found`)
    const next = { ...current, ...patch, updatedAt: new Date() }
    this.persons.set(id, next)
    return next
  }
  async deletePerson(id: string) {
    this.persons.delete(id)
    for (const [mid, m] of this.memberships) if (m.personId === id) this.memberships.delete(mid)
  }
  async listMemberships(householdUserId: string) {
    const ids = new Set((await this.listPersons(householdUserId)).map((p) => p.id))
    return [...this.memberships.values()].filter((m) => ids.has(m.personId))
  }
  async findMembershipByChildId(childId: string) {
    return [...this.memberships.values()].find((m) => m.childId === childId) ?? null
  }
  async createMembership(input: Omit<MembershipRecord, 'id'>) {
    const record = { ...input, id: randomUUID() }
    this.memberships.set(record.id, record)
    return record
  }
  async deleteMembership(id: string) {
    this.memberships.delete(id)
  }
  async moveMemberships(fromPersonId: string, toPersonId: string) {
    for (const [mid, m] of this.memberships) if (m.personId === fromPersonId) this.memberships.set(mid, { ...m, personId: toPersonId })
  }
  async findPartnerLinkByPersonA(personAUserId: string) {
    return this.links.get(personAUserId) ?? null
  }
  async findPartnerLinkByPersonB(personBUserId: string) {
    return [...this.links.values()].find((l) => l.personBUserId !== '' && l.personBUserId === personBUserId) ?? null
  }
  async upsertPartnerLink(personAUserId: string, data: Omit<PartnerLinkRecord, 'id' | 'personAUserId'>) {
    const record = { id: this.links.get(personAUserId)?.id ?? randomUUID(), personAUserId, ...data }
    this.links.set(personAUserId, record)
    return record
  }
  async listCandidates(householdUserId: string) {
    return [...this.candidates.values()].filter((c) => c.householdUserId === householdUserId)
  }
  async createCandidate(input: Omit<MergeCandidateRecord, 'id' | 'resolution'>) {
    const known = [...this.candidates.values()].some(
      (c) => (c.personId === input.personId && c.otherPersonId === input.otherPersonId) || (c.personId === input.otherPersonId && c.otherPersonId === input.personId),
    )
    if (known) return
    const id = randomUUID()
    this.candidates.set(id, { ...input, id, resolution: null })
  }
  async resolveCandidate(id: string, resolution: 'same' | 'different') {
    const current = this.candidates.get(id)
    if (!current) throw new Error(`HouseholdMergeCandidate ${id} not found`)
    const next = { ...current, resolution }
    this.candidates.set(id, next)
    return next
  }
}
