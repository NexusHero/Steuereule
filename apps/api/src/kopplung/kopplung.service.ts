import { Inject, Injectable } from '@nestjs/common'
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { randomBytes } from 'node:crypto'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import {
  MASTER_DATA_FIELDS,
  MASTER_DATA_REPOSITORY,
  type MasterDataRecord,
  type MasterDataRepository,
} from '../stammdaten/stammdaten.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository, type PartnerCouplingRecord } from './kopplung.repository.js'
import type { LinkPersonBDto, LinkResponseDto, SetLinkDto } from './dto/kopplung.dto.js'

const SHADOW_PREFIX = 'spouse_'

function shadowId(userId: string, taxYear: number): string {
  return `${SHADOW_PREFIX}${userId}_${taxYear}`
}

function hasOwnAccount(row: PartnerCouplingRecord): boolean {
  return row.personBUserId !== '' && !row.personBUserId.startsWith(SHADOW_PREFIX)
}

const INVITATION_VALID_MS = 14 * 24 * 60 * 60 * 1000

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

@Injectable()
export class LinkService {
  constructor(
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly repository: PartnerCouplingRepository,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(MASTER_DATA_REPOSITORY) private readonly masterDataRepository: MasterDataRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async get(userId: string, taxYear: number): Promise<LinkResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, taxYear)
    if (!row) {
      return { filingType: 'keine' }
    }

    let personB: LinkPersonBDto | null = null
    if (row.filingType === 'zusammen' && row.personBUserId) {
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

  async set(userId: string, taxYear: number, dto: SetLinkDto, now = new Date()): Promise<LinkResponseDto> {
    const existing = await this.repository.findByUserAndYear(userId, taxYear)
    if (existing && existing.personAUserId !== userId) {
      throw new ForbiddenError('VERANLAGUNGSART_OWNED_BY_PERSON_A', 'Only person A can choose the Veranlagungsart.')
    }

    if (dto.filingType === 'zusammen') {
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
    } else {
      await this.repository.upsert(userId, taxYear, {
        filingType: 'einzel',
        personBUserId: '',
        invitationCode: null,
        invitationCodeValidUntil: null,
      })
    }

    return this.get(userId, taxYear)
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
        firstName: data.firstName ?? existing?.firstName ?? '',
        lastName: data.lastName ?? existing?.lastName ?? '',
        steuerId: data.steuerId !== undefined ? data.steuerId : existing?.steuerId ?? null,
        steuernummer: existing?.steuernummer ?? null,
      })
    }

    if (data.geburtsdatum !== undefined || data.religion !== undefined || data.beruf !== undefined) {
      const previous = (await this.masterDataRepository.findByUserId(spouseUserId)) ?? emptyMasterData()
      const religion = data.religion !== undefined ? data.religion : previous.religion
      await this.masterDataRepository.save(spouseUserId, {
        ...previous,
        geburtsdatum: data.geburtsdatum ?? previous.geburtsdatum,
        beruf: data.beruf ?? previous.beruf,
        religion,
        familienstand: 'verheiratet',
        religionEinwilligungAm:
          religion === null ? null : data.religion ? new Date() : previous.religionEinwilligungAm,
      })
    }

    return this.get(userId, taxYear)
  }

  async joinWithCode(userId: string, taxYear: number, code: string, now = new Date()): Promise<LinkResponseDto> {
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
    await this.repository.setPersonB(row.id, userId)
    return this.get(userId, taxYear)
  }
}
