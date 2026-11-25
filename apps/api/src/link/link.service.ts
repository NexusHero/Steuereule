import { Inject, Injectable, Optional } from '@nestjs/common'
import { HouseholdAccessService, linkActiveIn } from '../household-core/household-access.service.js'
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { randomBytes } from 'node:crypto'
import { withSystemDatabaseAccess } from '../common/database-identity.js'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import {
  MASTER_DATA_FIELDS,
  MASTER_DATA_REPOSITORY,
  type MasterDataRecord,
  type MasterDataRepository,
} from '../master-data/master-data.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository, type PartnerCouplingRecord } from './link.repository.js'
import { personBConsentPending, personBHasOwnAccount } from './partner-consent.js'
import type { LinkPersonBDto, LinkResponseDto, SetLinkDto } from './dto/link.dto.js'

const SHADOW_PREFIX = 'spouse_'

function shadowId(userId: string, taxYear: number): string {
  return `${SHADOW_PREFIX}${userId}_${taxYear}`
}

const hasOwnAccount = personBHasOwnAccount

const INVITATION_VALID_MS = 14 * 24 * 60 * 60 * 1000

/**
 * The Person B whose figures this user keeps in a year (ADR-0054): B without an own account, under A's
 * link. B with an own account keeps their own data, which no one else reads (ADR-0098 §5).
 */
export function recordedSpouseUserId(row: PartnerCouplingRecord | null, userId: string): string | null {
  if (row === null || row.personAUserId !== userId || row.personBUserId === '' || hasOwnAccount(row)) return null
  return row.personBUserId
}

function newInvitation(now: Date): { invitationCode: string; invitationCodeValidUntil: Date } {
  return {
    invitationCode: randomBytes(8).toString('hex').toUpperCase(),
    invitationCodeValidUntil: new Date(now.getTime() + INVITATION_VALID_MS),
  }
}

function invitationValid(row: PartnerCouplingRecord, now: Date): boolean {
  return row.invitationCode !== null && row.invitationCodeValidUntil !== null && row.invitationCodeValidUntil > now
}

function emptyMasterData(): MasterDataRecord {
  const values = Object.fromEntries(MASTER_DATA_FIELDS.map((field) => [field, null])) as Omit<
    MasterDataRecord,
    'religionEinwilligungAm'
  >
  return { ...values, religionEinwilligungAm: null }
}

/** Interview Familienstand → master data value; „Geschieden oder getrennt“ is two values there, so it is left to the user. */
const MARITAL_STATUS_FROM_INTERVIEW: Readonly<Record<string, 'ledig' | 'verheiratet' | 'verwitwet'>> = {
  Ledig: 'ledig',
  Verheiratet: 'verheiratet',
  Verwitwet: 'verwitwet',
}

@Injectable()
export class LinkService {
  constructor(
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly repository: PartnerCouplingRepository,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterDataRepository: MasterDataRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(HouseholdAccessService) private readonly household?: HouseholdAccessService,
  ) {}

  async get(userId: string, taxYear: number): Promise<LinkResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row) {
      return { filingType: 'keine' }
    }

    const pending = personBConsentPending(row)
    const callerIsA = row.personAUserId === userId
    let personB: LinkPersonBDto | null = null
    if (row.filingType === 'zusammen' && row.personBUserId && !(callerIsA && pending)) {
      const otherId = row.personAUserId === userId ? row.personBUserId : row.personAUserId
      const [prof, sd] = await Promise.all([
        this.profileRepository.findByUserId(otherId),
        this.masterDataRepository.findByUserId(otherId),
      ])
      personB = {
        firstName: prof?.firstName ?? null,
        lastName: prof?.lastName ?? null,
        steuerId: prof?.steuerId ?? null,
        geburtsdatum: sd?.geburtsdatum ?? null,
        religion: sd?.religion ?? null,
        beruf: sd?.beruf ?? null,
      }
    }

    await this.auditService.append({ userId, action: 'READ', resource: 'kopplung' })
    return {
      filingType: row.filingType,
      personBUserId: row.personBUserId,
      invitationCode: row.invitationCode,
      invitationCodeValidUntil: row.invitationCodeValidUntil?.toISOString() ?? null,
      personBHasOwnAccount: hasOwnAccount(row),
      personB,
      personBConsentPending: pending,
      consentRequestedFromMe: pending && !callerIsA,
      consentGivenByMe: !callerIsA && row.filingType === 'zusammen' && row.personBUserId === userId && !pending,
    }
  }

  /**
   * ADR-0054: whose data a request reads or writes. Person A may record Person B's figures (LStB, Arbeitsweg …)
   * while B has no account; they live under B's shadow id and move with B on joinWithCode. Once B has an
   * account, the data is B's alone.
   */
  async dataUser(userId: string, taxYear: number, person: 'A' | 'B'): Promise<string> {
    if (person === 'A') return userId
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row || row.filingType !== 'zusammen' || !row.personBUserId) {
      throw new InvalidInputError('NO_ACTIVE_ZUSAMMENVERANLAGUNG', 'There is no active Zusammenveranlagung.')
    }
    if (row.personAUserId !== userId) {
      throw new ForbiddenError('ONLY_PERSON_A_RECORDS_FOR_B', 'Only person A records data for person B.')
    }
    if (hasOwnAccount(row)) {
      throw new ForbiddenError('PERSON_B_OWNS_DATA', 'Person B maintains their data in their own account.')
    }
    return row.personBUserId
  }

  /** Every Person B this user records data for (joint returns without B's own account), over all years. */
  async recordedPartnerUserIds(userId: string): Promise<readonly string[]> {
    const rows = await this.repository.listForPersonA(userId)
    return [...new Set(rows.filter((row) => row.filingType === 'zusammen' && row.personBUserId !== '' && !hasOwnAccount(row)).map((row) => row.personBUserId))]
  }

  /**
   * The spouse as the owl needs to know them (ADR-0073): whose data they are, whether the user may
   * record figures for them, and the names only so they can be taken out of chat text. Null
   * without a joint return with a Person B.
   */
  async spouseForAdvisor(
    userId: string,
    taxYear: number,
  ): Promise<{ spouseUserId: string; recordable: boolean; firstName: string | null; lastName: string | null } | null> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row || row.filingType !== 'zusammen' || !row.personBUserId) return null
    // Without B's consent for the year, A's owl knows nothing of B either (decision 3).
    if (row.personAUserId === userId && personBConsentPending(row)) return null
    const spouseUserId = row.personAUserId === userId ? row.personBUserId : row.personAUserId
    const profile = await this.profileRepository.findByUserId(spouseUserId)
    return {
      spouseUserId,
      recordable: row.personAUserId === userId && !hasOwnAccount(row),
      firstName: profile?.firstName || null,
      lastName: profile?.lastName || null,
    }
  }

  async set(userId: string, taxYear: number, dto: SetLinkDto, now = new Date()): Promise<LinkResponseDto> {
    const existing = await this.repository.findByUserAndYear(userId, taxYear)
    if (existing && existing.personAUserId !== userId) {
      throw new ForbiddenError('VERANLAGUNGSART_OWNED_BY_PERSON_A', 'Only person A can choose the Veranlagungsart.')
    }

    if (dto.filingType === 'zusammen') {
      // ADR-0062: a couple linked once stays linked in every later year — no new invitation (AC 2).
      const partner = await this.household?.partnerLink(userId)
      if (partner && partner.personBUserId !== '' && linkActiveIn(partner, taxYear) && !(existing?.filingType === 'zusammen' && existing.personBUserId !== '')) {
        // A new year of the link: B is asked in B's own app before A sees anything of B (decision 3, API-3).
        await this.repository.upsert(userId, taxYear, {
          filingType: 'zusammen',
          personBUserId: partner.personBUserId,
          invitationCode: null,
          invitationCodeValidUntil: null,
          personBConsentedAt: null,
        })
        return this.get(userId, taxYear)
      }
      const remains = existing?.filingType === 'zusammen' && existing.personBUserId !== ''
      const invitation =
        remains && hasOwnAccount(existing)
          ? { invitationCode: null, invitationCodeValidUntil: null }
          : remains && invitationValid(existing, now)
            ? { invitationCode: existing.invitationCode, invitationCodeValidUntil: existing.invitationCodeValidUntil }
            : newInvitation(now)
      await this.repository.upsert(userId, taxYear, {
        filingType: 'zusammen',
        personBUserId: remains ? existing.personBUserId : shadowId(userId, taxYear),
        ...invitation,
      })
      if (!remains) await this.prefillSpouseFromHousehold(userId, taxYear, shadowId(userId, taxYear))
    } else {
      await this.repository.upsert(userId, taxYear, {
        filingType: 'einzel',
        personBUserId: '',
        invitationCode: null,
        invitationCodeValidUntil: null,
        personBConsentedAt: null,
      })
    }

    return this.get(userId, taxYear)
  }

  /**
   * One data stream (UX review H3): what the interview already knows about the household is not asked
   * again. An empty Familienstand in the master data takes the interview answer, and „Verheiratet“
   * sets up the joint return when none is chosen yet. Nothing the user entered elsewhere is overwritten.
   */
  async adoptInterviewHousehold(userId: string, taxYear: number, answers: { readonly familienstand?: string | undefined }): Promise<void> {
    const status = MARITAL_STATUS_FROM_INTERVIEW[answers.familienstand ?? '']
    if (status === undefined) return
    const masterData = await this.masterDataRepository.findByUserId(userId)
    if (!masterData?.familienstand) {
      await this.masterDataRepository.save(userId, { ...(masterData ?? emptyMasterData()), familienstand: status })
    }
    if (status !== 'verheiratet') return
    const existing = await this.repository.findByUserAndYear(userId, taxYear)
    if (existing === null) await this.set(userId, taxYear, { filingType: 'zusammen' })
  }

  async updatePersonB(userId: string, taxYear: number, data: LinkPersonBDto): Promise<LinkResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row || row.filingType !== 'zusammen' || !row.personBUserId) {
      throw new InvalidInputError('NO_ACTIVE_ZUSAMMENVERANLAGUNG', 'There is no active Zusammenveranlagung.')
    }
    if (row.personAUserId !== userId || hasOwnAccount(row)) {
      throw new ForbiddenError('PERSON_B_OWNS_DATA', 'Person B maintains their data in their own account.')
    }
    if (data.religion && data.religionConsent !== true) {
      throw new InvalidInputError('RELIGION_CONSENT_REQUIRED', 'religion requires religionConsent = true (Art. 9 DSGVO).')
    }

    const spouseUserId = row.personBUserId

    if (data.firstName !== undefined || data.lastName !== undefined || data.steuerId !== undefined) {
      const existing = await this.profileRepository.findByUserId(spouseUserId)
      await this.profileRepository.upsert(spouseUserId, {
        // One rule for every field (WEB-29): absent keeps what is stored, null clears it.
        firstName: data.firstName !== undefined ? (data.firstName ?? '') : (existing?.firstName ?? ''),
        lastName: data.lastName !== undefined ? (data.lastName ?? '') : (existing?.lastName ?? ''),
        steuerId: data.steuerId !== undefined ? data.steuerId : existing?.steuerId ?? null,
        steuernummer: existing?.steuernummer ?? null,
      })
    }

    if (data.geburtsdatum !== undefined || data.religion !== undefined || data.beruf !== undefined) {
      const previous = (await this.masterDataRepository.findByUserId(spouseUserId)) ?? emptyMasterData()
      const religion = data.religion !== undefined ? data.religion : previous.religion
      await this.masterDataRepository.save(spouseUserId, {
        ...previous,
        geburtsdatum: data.geburtsdatum !== undefined ? data.geburtsdatum : previous.geburtsdatum,
        beruf: data.beruf !== undefined ? data.beruf : previous.beruf,
        religion,
        familienstand: 'verheiratet',
        religionEinwilligungAm:
          religion === null ? null : data.religion ? new Date() : previous.religionEinwilligungAm,
      })
    }

    return this.get(userId, taxYear)
  }

  async joinWithCode(userId: string, taxYear: number, code: string, now = new Date()): Promise<LinkResponseDto> {
    // The code sits on person A's row, and redeeming it moves A's shadow data to B and links A's household:
    // rows of another account, so a system path (P11). Reading the result afterwards runs as B again.
    await withSystemDatabaseAccess('partner-invitation', () => this.redeemInvitation(userId, taxYear, code, now))
    return this.get(userId, taxYear)
  }

  private async redeemInvitation(userId: string, taxYear: number, code: string, now: Date): Promise<void> {
    const row = await this.repository.findByInvitationCode(code)
    if (!row || row.taxYear !== taxYear) {
      throw new NotFoundError('INVITATION_CODE_INVALID', 'The invitation code is invalid.')
    }
    if (!invitationValid(row, now)) {
      throw new NotFoundError('INVITATION_CODE_EXPIRED', 'The invitation code has expired.')
    }
    if (row.personAUserId === userId) {
      throw new InvalidInputError('INVITATION_IS_OWN', 'You cannot couple with your own invitation.')
    }
    // The interview may have set up this user's own joint return already (UX review H3). As long as no
    // spouse account joined it, it is only a placeholder: joining the partner's return replaces it.
    const own = await this.repository.findByUserAndYear(userId, taxYear)
    const ownPlaceholder = own !== null && own.id !== row.id && own.personAUserId === userId
    if (ownPlaceholder && hasOwnAccount(own)) {
      throw new InvalidInputError('ALREADY_COUPLED', 'This year is already coupled with another account.')
    }
    // One code, one redeemer (API-8): the claim is a compare-and-set; a concurrent second redeemer loses.
    const claimed = await this.repository.claimInvitation(code, taxYear, userId, now)
    if (!claimed) throw new NotFoundError('INVITATION_CODE_INVALID', 'The invitation code is invalid.')
    if (ownPlaceholder) await this.repository.delete(userId, taxYear)
    await this.household?.linkPartner(row.personAUserId, userId, taxYear)
  }

  /** Person B agrees, in B's own app, to share this year with Person A (decision 3, API-3). */
  async consentForYear(userId: string, taxYear: number, now = new Date()): Promise<LinkResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row || row.filingType !== 'zusammen' || row.personBUserId !== userId || row.personAUserId === userId) {
      throw new NotFoundError('NO_CONSENT_REQUESTED', 'Für dieses Jahr wartet keine Zusammenveranlagung auf deine Zustimmung.')
    }
    if (personBConsentPending(row)) await this.repository.recordPersonBConsent(row.id, userId, now)
    return this.get(userId, taxYear)
  }

  /**
   * Person B takes the consent for this year back, in B's own app (decision 3). From the next request on, A sees
   * nothing of B for the year: the app withholds B's id (`couplingVisibleTo`) and the database policy asks for
   * the agreed year. The joint year itself stays; B can agree again.
   */
  async withdrawConsentForYear(userId: string, taxYear: number): Promise<LinkResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row || row.filingType !== 'zusammen' || row.personBUserId !== userId || row.personAUserId === userId || personBConsentPending(row)) {
      throw new NotFoundError('NO_CONSENT_GIVEN', 'Für dieses Jahr hast du keine Zustimmung gegeben, die du zurücknehmen kannst.')
    }
    await this.repository.withdrawPersonBConsent(row.id, userId)
    return this.get(userId, taxYear)
  }

  /** A spouse without an account is typed once: a new year's placeholder starts from the household (AC 1). */
  private async prefillSpouseFromHousehold(userId: string, taxYear: number, spouseUserId: string): Promise<void> {
    const facts = await this.household?.spouseFacts(userId, taxYear)
    if (!facts || (await this.profileRepository.findByUserId(spouseUserId))) return
    await this.profileRepository.upsert(spouseUserId, { firstName: facts.firstName, lastName: facts.lastName, steuerId: facts.taxId, steuernummer: null })
    const previous = (await this.masterDataRepository.findByUserId(spouseUserId)) ?? emptyMasterData()
    await this.masterDataRepository.save(spouseUserId, { ...previous, geburtsdatum: facts.birthDate, familienstand: 'verheiratet' })
  }
}
