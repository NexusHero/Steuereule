import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { asksForEducation, isPreselectedForYear, planHouseholdMerge, type HouseholdEntry } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { CHILD_REPOSITORY, type ChildRecord, type ChildRepository } from '../children/child.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { HOUSEHOLD_REPOSITORY, type HouseholdPersonRecord, type HouseholdRepository, type MembershipRecord } from './household.repository.js'
import { HouseholdAccessService } from './household-access.service.js'
import { PersonSealService, type PersonFacts } from './person-seal.service.js'

export interface HouseholdPersonView {
  readonly personId: string
  readonly kind: 'spouse' | 'child'
  readonly firstName: string
  readonly lastName: string
  readonly birthDate: string
  /** The year's record (Kind row id) when the person is part of the year. */
  readonly childId: string | null
  readonly inThisYear: boolean
  /** Last earlier year the person was part of, for the „aus 2025“ mark. */
  readonly fromYear: number | null
  readonly preselected: boolean
  readonly selectable: boolean
  readonly asksForEducation: boolean
  readonly leftFromYear: number | null
  readonly updatedBySelf: boolean
  readonly updatedAt: string
}

export interface HouseholdCandidateView {
  readonly id: string
  readonly a: { readonly personId: string; readonly name: string; readonly birthDate: string }
  readonly b: { readonly personId: string; readonly name: string; readonly birthDate: string }
}

export interface HouseholdView {
  readonly householdUserId: string
  readonly persons: readonly HouseholdPersonView[]
  readonly candidates: readonly HouseholdCandidateView[]
  readonly partnerLink: { readonly validFromYear: number; readonly endedFromYear: number | null; readonly ownAccount: boolean } | null
}

const isShadow = (userId: string) => userId.startsWith('spouse_')

/**
 * Household at account level (#452, ADR-0062). Expand only: the yearly Kind rows and the
 * SteuerjahrKopplung stay what every calculation reads; the household is where a new year takes
 * its people from. The migration runs lazily per account and is idempotent.
 */
@Injectable()
export class HouseholdService {
  constructor(
    @Inject(HOUSEHOLD_REPOSITORY) private readonly repo: HouseholdRepository,
    @Inject(PersonSealService) private readonly seal: PersonSealService,
    @Inject(CHILD_REPOSITORY) private readonly children: ChildRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly links: PartnerCouplingRepository,
    @Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterData: MasterDataRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(HouseholdAccessService) private readonly access: HouseholdAccessService,
  ) {}

  /** Whose household a request works on: a linked spouse with an own account shares A's (decision 7). */
  householdOwner(userId: string, taxYear?: number): Promise<string> {
    return this.access.householdOwner(userId, taxYear)
  }

  /** ADR-0062 §5: group every yearly record into people; repeatable, never changes a record. */
  async migrate(householdUserId: string, actorUserId: string): Promise<void> {
    const memberships = await this.repo.listMemberships(householdUserId)
    const linkedChildIds = new Set(memberships.flatMap((m) => (m.childId ? [m.childId] : [])))
    const linkedSpouseYears = new Set(memberships.flatMap((m) => (m.spouseUserId ? [`${m.spouseUserId}:${m.taxYear}`] : [])))
    const persons = await this.repo.listPersons(householdUserId)
    const facts = new Map<string, PersonFacts>()
    for (const p of persons) {
      const f = await this.seal.unseal(p.id, p.sealed)
      if (f) facts.set(p.id, f)
    }

    await this.migrateKind(householdUserId, actorUserId, 'child', persons, facts,
      (await this.children.listAllForUser(householdUserId))
        .filter((c) => !linkedChildIds.has(c.id))
        .map((c) => ({ entry: { key: c.id, firstName: c.firstName, lastName: c.lastName, birthDate: c.geburtsdatum }, taxYear: c.taxYear, taxId: c.taxId, childId: c.id, spouseUserId: null })),
    )

    const spouseRows = (await this.links.listForPersonA(householdUserId)).filter(
      (l) => l.filingType === 'zusammen' && l.personBUserId !== '' && !linkedSpouseYears.has(`${l.personBUserId}:${l.taxYear}`),
    )
    const spouseInputs = []
    for (const row of spouseRows) {
      const [profile, md] = await Promise.all([this.profiles.findByUserId(row.personBUserId), this.masterData.findByUserId(row.personBUserId)])
      if (!profile?.firstName || !profile.lastName || !md?.geburtsdatum) continue
      spouseInputs.push({
        entry: { key: `${row.personBUserId}:${row.taxYear}`, firstName: profile.firstName, lastName: profile.lastName, birthDate: md.geburtsdatum },
        taxYear: row.taxYear,
        taxId: profile.steuerId,
        childId: null,
        spouseUserId: row.personBUserId,
        linkedUserId: isShadow(row.personBUserId) ? null : row.personBUserId,
      })
    }
    await this.migrateKind(householdUserId, actorUserId, 'spouse', persons, facts, spouseInputs)

    const link = await this.repo.findPartnerLinkByPersonA(householdUserId)
    const ownAccount = spouseRows.find((r) => !isShadow(r.personBUserId))
    if (!link && ownAccount) {
      await this.repo.upsertPartnerLink(householdUserId, { personBUserId: ownAccount.personBUserId, spousePersonId: null, validFromYear: ownAccount.taxYear, endedFromYear: null })
    }
  }

  private async migrateKind(
    householdUserId: string,
    actorUserId: string,
    kind: 'spouse' | 'child',
    existing: readonly HouseholdPersonRecord[],
    facts: Map<string, PersonFacts>,
    inputs: readonly { entry: HouseholdEntry; taxYear: number; taxId: string | null; childId: string | null; spouseUserId: string | null; linkedUserId?: string | null }[],
  ): Promise<void> {
    if (inputs.length === 0) return
    const known = existing.filter((p) => p.kind === kind && facts.has(p.id))
    // Existing people take part as pseudo-entries so new records join them instead of duplicating.
    const seeds: HouseholdEntry[] = known.map((p) => {
      const f = facts.get(p.id)!
      return { key: `person:${p.id}`, firstName: f.firstName, lastName: f.lastName, birthDate: f.birthDate }
    })
    const plan = planHouseholdMerge([...seeds, ...inputs.map((i) => i.entry)])
    const byKey = new Map(inputs.map((i) => [i.entry.key, i]))
    const personIdOfGroup: string[] = []

    for (const group of plan.persons) {
      const seed = group.keys.find((k) => k.startsWith('person:'))
      const records = group.keys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []))
      let personId = seed?.slice('person:'.length)
      if (!personId) {
        const latest = records[records.length - 1]!
        personId = randomUUID()
        const sealed = await this.seal.seal(personId, {
          firstName: latest.entry.firstName,
          lastName: latest.entry.lastName,
          birthDate: latest.entry.birthDate,
          taxId: records.reduce<string | null>((found, r) => r.taxId ?? found, null),
          diedOn: null,
        })
        await this.repo.createPerson({ id: personId, householdUserId, kind, sealed, updatedByUserId: actorUserId, linkedUserId: latest.linkedUserId ?? null })
      }
      personIdOfGroup.push(personId)
      for (const r of records) {
        await this.repo.createMembership({ personId, taxYear: r.taxYear, childId: r.childId, spouseUserId: r.spouseUserId }).catch(() => undefined)
      }
    }
    for (const [i, j] of plan.candidates) {
      const a = personIdOfGroup[i]!
      const b = personIdOfGroup[j]!
      if (a !== b) await this.repo.createCandidate({ householdUserId, personId: a, otherPersonId: b })
    }
  }

  async view(userId: string, taxYear: number): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, taxYear)
    await this.migrate(owner, userId)
    const [persons, memberships, candidates, link] = await Promise.all([
      this.repo.listPersons(owner),
      this.repo.listMemberships(owner),
      this.repo.listCandidates(owner),
      this.repo.findPartnerLinkByPersonA(owner),
    ])
    const views: HouseholdPersonView[] = []
    const names = new Map<string, { name: string; birthDate: string }>()
    for (const p of persons) {
      const f = await this.seal.unseal(p.id, p.sealed)
      if (!f) continue
      names.set(p.id, { name: `${f.firstName} ${f.lastName}`, birthDate: f.birthDate })
      const mine = memberships.filter((m) => m.personId === p.id)
      const current = mine.find((m) => m.taxYear === taxYear) ?? null
      const earlier = mine.filter((m) => m.taxYear < taxYear).map((m) => m.taxYear)
      const fromYear = earlier.length > 0 ? Math.max(...earlier) : null
      const left = p.leftFromYear !== null && p.leftFromYear <= taxYear
      const diedLongAgo = f.diedOn !== null && Number(f.diedOn.slice(0, 4)) < taxYear - 1
      const selectable = !left && !diedLongAgo
      views.push({
        personId: p.id,
        kind: p.kind,
        firstName: f.firstName,
        lastName: f.lastName,
        birthDate: f.birthDate,
        childId: current?.childId ?? null,
        inThisYear: current !== null,
        fromYear,
        preselected: current === null && selectable && fromYear === taxYear - 1 && (p.kind === 'spouse' || isPreselectedForYear(f.birthDate, taxYear)),
        selectable,
        asksForEducation: p.kind === 'child' && asksForEducation(f.birthDate, taxYear),
        leftFromYear: p.leftFromYear,
        updatedBySelf: p.updatedByUserId === userId,
        updatedAt: p.updatedAt.toISOString(),
      })
    }
    await this.audit.append({ userId, action: 'READ', resource: 'haushalt' })
    return {
      householdUserId: owner,
      persons: views,
      candidates: candidates
        .filter((c) => c.resolution === null && names.has(c.personId) && names.has(c.otherPersonId))
        .map((c) => ({ id: c.id, a: { personId: c.personId, ...names.get(c.personId)! }, b: { personId: c.otherPersonId, ...names.get(c.otherPersonId)! } })),
      partnerLink: link ? { validFromYear: link.validFromYear, endedFromYear: link.endedFromYear, ownAccount: link.personBUserId !== '' } : null,
    }
  }

  /** „Für 2026 bestätigen“: creates the year's Kind rows from the household (decision 3, AC 1). */
  async adoptChildren(userId: string, taxYear: number, personIds: readonly string[]): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, taxYear)
    const memberships = await this.repo.listMemberships(owner)
    for (const personId of personIds) {
      const person = await this.ownedPerson(owner, personId)
      if (person.kind !== 'child') throw new InvalidInputError('HOUSEHOLD_NOT_A_CHILD', 'Only children are adopted into the Kinder mask.')
      if (memberships.some((m) => m.personId === personId && m.taxYear === taxYear)) continue
      if (person.leftFromYear !== null && person.leftFromYear <= taxYear) {
        throw new InvalidInputError('HOUSEHOLD_PERSON_LEFT', 'This person is no longer part of the household in this year.')
      }
      const facts = await this.factsOf(person)
      // Stable details come from the latest earlier year; the yearly answers are asked again (decision 4).
      const latest = await this.latestChildRow(memberships, personId, taxYear)
      const child = await this.children.create(owner, taxYear, {
        firstName: facts.firstName,
        lastName: facts.lastName,
        geburtsdatum: facts.birthDate,
        taxId: facts.taxId,
        kinship: latest?.kinship ?? null,
        kinshipB: latest?.kinshipB ?? null,
        familyBenefitsOffice: latest?.familyBenefitsOffice ?? null,
        otherParent: latest?.otherParent ?? null,
        otherParentName: latest?.otherParentName ?? null,
        otherParentBirthDate: latest?.otherParentBirthDate ?? null,
        otherParentAddress: latest?.otherParentAddress ?? null,
        otherParentKind: latest?.otherParentKind ?? null,
        otherParentDiedOn: latest?.otherParentDiedOn ?? null,
      })
      await this.repo.createMembership({ personId, taxYear, childId: child.id, spouseUserId: null })
    }
    await this.audit.append({ userId, action: 'WRITE', resource: 'haushalt' })
    return this.view(userId, taxYear)
  }

  /** „Ab Jahr X nicht mehr dabei“: years before X stay exactly as they are (AC 5). */
  async leaveFromYear(userId: string, personId: string, fromYear: number): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, fromYear)
    await this.ownedPerson(owner, personId)
    for (const m of (await this.repo.listMemberships(owner)).filter((x) => x.personId === personId && x.taxYear >= fromYear)) {
      if (m.childId) await this.children.delete(owner, m.taxYear, m.childId)
      await this.repo.deleteMembership(m.id)
    }
    await this.repo.updatePerson(personId, { leftFromYear: fromYear, updatedByUserId: userId })
    const link = await this.repo.findPartnerLinkByPersonA(owner)
    const person = await this.repo.findPerson(personId)
    if (link && person?.kind === 'spouse') await this.repo.upsertPartnerLink(owner, { ...link, endedFromYear: fromYear })
    await this.audit.append({ userId, action: 'WRITE', resource: 'haushalt' })
    return this.view(userId, fromYear)
  }

  /** Ends the spouse link from a year on (e.g. a divorce); the years before keep their Kopplung. */
  async endPartnerLink(userId: string, fromYear: number): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, fromYear)
    const link = await this.repo.findPartnerLinkByPersonA(owner)
    if (link) await this.repo.upsertPartnerLink(owner, { ...link, endedFromYear: fromYear })
    for (const spouse of (await this.repo.listPersons(owner)).filter((p) => p.kind === 'spouse' && p.leftFromYear === null)) {
      await this.repo.updatePerson(spouse.id, { leftFromYear: fromYear, updatedByUserId: userId })
    }
    await this.audit.append({ userId, action: 'WRITE', resource: 'haushalt' })
    return this.view(userId, fromYear)
  }

  /** „Endgültig löschen“: every year's record goes, then the person's key (crypto-shredding, AC 5). */
  async deletePerson(userId: string, personId: string, taxYear: number): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, taxYear)
    await this.ownedPerson(owner, personId)
    for (const m of (await this.repo.listMemberships(owner)).filter((x) => x.personId === personId)) {
      if (m.childId) await this.children.delete(owner, m.taxYear, m.childId)
    }
    await this.repo.deletePerson(personId)
    await this.seal.destroy(personId)
    await this.audit.append({ userId, action: 'WRITE', resource: 'haushalt' })
    return this.view(userId, taxYear)
  }

  /** „Sind das dieselben?“ — asked once (AC 4). */
  async answerCandidate(userId: string, candidateId: string, same: boolean, taxYear: number): Promise<HouseholdView> {
    const owner = await this.householdOwner(userId, taxYear)
    const candidate = (await this.repo.listCandidates(owner)).find((c) => c.id === candidateId)
    if (!candidate) throw new NotFoundError('HOUSEHOLD_CANDIDATE_NOT_FOUND', 'This question does not exist.')
    if (same) {
      const memberships = await this.repo.listMemberships(owner)
      const yearsA = new Set(memberships.filter((m) => m.personId === candidate.personId).map((m) => m.taxYear))
      if (memberships.some((m) => m.personId === candidate.otherPersonId && yearsA.has(m.taxYear))) {
        throw new ConflictError('HOUSEHOLD_SAME_YEAR', 'Both are recorded in the same year, so they are two people.')
      }
      await this.repo.moveMemberships(candidate.otherPersonId, candidate.personId)
      await this.repo.deletePerson(candidate.otherPersonId)
      await this.seal.destroy(candidate.otherPersonId)
    }
    await this.repo.resolveCandidate(candidateId, same ? 'same' : 'different')
    await this.audit.append({ userId, action: 'WRITE', resource: 'haushalt' })
    return this.view(userId, taxYear)
  }

  recordChildEdit(userId: string, childId: string, patch: { firstName?: string; lastName?: string; geburtsdatum?: string; taxId?: string | null }): Promise<void> {
    return this.access.recordChildEdit(userId, childId, patch)
  }

  private async ownedPerson(owner: string, personId: string): Promise<HouseholdPersonRecord> {
    const person = await this.repo.findPerson(personId)
    if (!person || person.householdUserId !== owner) throw new NotFoundError('HOUSEHOLD_PERSON_NOT_FOUND', 'This person is not part of your household.')
    return person
  }

  private async factsOf(person: HouseholdPersonRecord): Promise<PersonFacts> {
    const facts = await this.seal.unseal(person.id, person.sealed)
    if (!facts) throw new NotFoundError('HOUSEHOLD_PERSON_DELETED', 'This person was deleted.')
    return facts
  }

  private async latestChildRow(memberships: readonly MembershipRecord[], personId: string, beforeYear: number): Promise<ChildRecord | null> {
    const earlier = memberships.filter((m) => m.personId === personId && m.childId && m.taxYear < beforeYear).sort((a, b) => b.taxYear - a.taxYear)[0]
    if (!earlier?.childId) return null
    const owner = (await this.repo.findPerson(personId))!.householdUserId
    return (await this.children.listForUserAndYear(owner, earlier.taxYear)).find((c) => c.id === earlier.childId) ?? null
  }
}
