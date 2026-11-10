import { Inject, Injectable } from '@nestjs/common'
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository, type PartnerLinkRecord } from './household.repository.js'
import { PersonSealService, type PersonFacts } from './person-seal.service.js'

/**
 * The household facts the Kinder and Kopplung services need (ADR-0062), kept apart from
 * HouseholdService so neither module depends on the other.
 */
@Injectable()
export class HouseholdAccessService {
  constructor(
    @Inject(HOUSEHOLD_REPOSITORY) private readonly repo: HouseholdRepository,
    @Inject(PersonSealService) private readonly seal: PersonSealService,
  ) {}

  /** Whose household a request works on: a linked spouse with an own account shares A's (decision 7). */
  async householdOwner(userId: string, taxYear?: number): Promise<string> {
    const link = await this.repo.findPartnerLinkByPersonB(userId)
    if (!link) return userId
    return taxYear === undefined || linkActiveIn(link, taxYear) ? link.personAUserId : userId
  }

  /** Keeps the household in step when a year's Kind row is edited, and records who edited (AC 6). */
  async recordChildEdit(userId: string, childId: string, patch: { firstName?: string; lastName?: string; geburtsdatum?: string; taxId?: string | null }): Promise<void> {
    const membership = await this.repo.findMembershipByChildId(childId)
    if (!membership) return
    const person = await this.repo.findPerson(membership.personId)
    if (!person) return
    const facts = await this.seal.unseal(person.id, person.sealed)
    if (!facts) return
    const next: PersonFacts = {
      ...facts,
      ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
      ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
      ...(patch.geburtsdatum !== undefined ? { birthDate: patch.geburtsdatum } : {}),
      ...(patch.taxId !== undefined ? { taxId: patch.taxId } : {}),
    }
    await this.repo.updatePerson(person.id, { sealed: await this.seal.seal(person.id, next), updatedByUserId: userId })
  }

  async partnerLink(personAUserId: string): Promise<PartnerLinkRecord | null> {
    return this.repo.findPartnerLinkByPersonA(personAUserId)
  }

  /** Redeeming the invitation once links the couple for this and every later year (AC 2). */
  async linkPartner(personAUserId: string, personBUserId: string, fromYear: number): Promise<void> {
    const existing = await this.repo.findPartnerLinkByPersonA(personAUserId)
    await this.repo.upsertPartnerLink(personAUserId, {
      personBUserId,
      spousePersonId: existing?.spousePersonId ?? null,
      validFromYear: Math.min(existing?.validFromYear ?? fromYear, fromYear),
      endedFromYear: null,
    })
  }

  /** The spouse's facts for prefilling a new year's placeholder (decision 2). */
  async spouseFacts(householdUserId: string, taxYear: number): Promise<PersonFacts | null> {
    const spouse = (await this.repo.listPersons(householdUserId)).find((p) => p.kind === 'spouse' && (p.leftFromYear === null || taxYear < p.leftFromYear))
    return spouse ? this.seal.unseal(spouse.id, spouse.sealed) : null
  }
}

export function linkActiveIn(link: PartnerLinkRecord, taxYear: number): boolean {
  return link.validFromYear <= taxYear && (link.endedFromYear === null || taxYear < link.endedFromYear)
}
