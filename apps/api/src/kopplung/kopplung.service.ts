import { Inject, Injectable } from '@nestjs/common'
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { randomBytes } from 'node:crypto'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import {
  STAMMDATEN_FELDER,
  STAMMDATEN_REPOSITORY,
  type StammdatenRecord,
  type StammdatenRepository,
} from '../stammdaten/stammdaten.repository.js'
import { KOPPLUNG_REPOSITORY, type KopplungRepository, type SteuerjahrKopplungRecord } from './kopplung.repository.js'
import type { KopplungPersonBDto, KopplungResponseDto, SetKopplungDto } from './dto/kopplung.dto.js'

const SCHATTEN_PRAEFIX = 'spouse_'

function schattenId(userId: string, steuerjahr: number): string {
  return `${SCHATTEN_PRAEFIX}${userId}_${steuerjahr}`
}

function hatEigenesKonto(row: SteuerjahrKopplungRecord): boolean {
  return row.personBUserId !== '' && !row.personBUserId.startsWith(SCHATTEN_PRAEFIX)
}

const EINLADUNG_GUELTIG_MS = 14 * 24 * 60 * 60 * 1000

function neueEinladung(jetzt: Date): { einladungsCode: string; einladungsCodeGueltigBis: Date } {
  return {
    einladungsCode: randomBytes(8).toString('hex').toUpperCase(),
    einladungsCodeGueltigBis: new Date(jetzt.getTime() + EINLADUNG_GUELTIG_MS),
  }
}

function einladungGueltig(row: SteuerjahrKopplungRecord, jetzt: Date): boolean {
  return row.einladungsCode !== null && row.einladungsCodeGueltigBis !== null && row.einladungsCodeGueltigBis > jetzt
}

function leereStammdaten(): StammdatenRecord {
  const werte = Object.fromEntries(STAMMDATEN_FELDER.map((feld) => [feld, null])) as Omit<
    StammdatenRecord,
    'religionEinwilligungAm'
  >
  return { ...werte, religionEinwilligungAm: null }
}

@Injectable()
export class KopplungService {
  constructor(
    @Inject(KOPPLUNG_REPOSITORY) private readonly repository: KopplungRepository,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(STAMMDATEN_REPOSITORY) private readonly stammdatenRepository: StammdatenRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async get(userId: string, steuerjahr: number): Promise<KopplungResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (!row) {
      return { veranlagungsart: 'keine' }
    }

    let personB: KopplungPersonBDto | null = null
    if (row.veranlagungsart === 'zusammen' && row.personBUserId) {
      const otherId = row.personAUserId === userId ? row.personBUserId : row.personAUserId
      const [prof, sd] = await Promise.all([
        this.profileRepository.findByUserId(otherId),
        this.stammdatenRepository.findByUserId(otherId),
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
      veranlagungsart: row.veranlagungsart,
      personBUserId: row.personBUserId,
      einladungsCode: row.einladungsCode,
      einladungsCodeGueltigBis: row.einladungsCodeGueltigBis?.toISOString() ?? null,
      personBHatEigenesKonto: hatEigenesKonto(row),
      personB,
    }
  }

  /**
   * ADR-0054: whose data a request reads or writes. Person A may record Person B's figures (LStB, Arbeitsweg …)
   * while B has no account; they live under B's shadow id and move with B on joinWithCode. Once B has an
   * account, the data is B's alone.
   */
  async datenNutzer(userId: string, steuerjahr: number, person: 'A' | 'B'): Promise<string> {
    if (person === 'A') return userId
    const row = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (!row || row.veranlagungsart !== 'zusammen' || !row.personBUserId) {
      throw new InvalidInputError('NO_ACTIVE_ZUSAMMENVERANLAGUNG', 'There is no active Zusammenveranlagung.')
    }
    if (row.personAUserId !== userId) {
      throw new ForbiddenError('ONLY_PERSON_A_RECORDS_FOR_B', 'Only person A records data for person B.')
    }
    if (hatEigenesKonto(row)) {
      throw new ForbiddenError('PERSON_B_OWNS_DATA', 'Person B maintains their data in their own account.')
    }
    return row.personBUserId
  }

  async set(userId: string, steuerjahr: number, dto: SetKopplungDto, jetzt = new Date()): Promise<KopplungResponseDto> {
    const existing = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (existing && existing.personAUserId !== userId) {
      throw new ForbiddenError('VERANLAGUNGSART_OWNED_BY_PERSON_A', 'Only person A can choose the Veranlagungsart.')
    }

    if (dto.veranlagungsart === 'zusammen') {
      const bleibt = existing?.veranlagungsart === 'zusammen' && existing.personBUserId !== ''
      const einladung =
        bleibt && hatEigenesKonto(existing)
          ? { einladungsCode: null, einladungsCodeGueltigBis: null }
          : bleibt && einladungGueltig(existing, jetzt)
            ? { einladungsCode: existing.einladungsCode, einladungsCodeGueltigBis: existing.einladungsCodeGueltigBis }
            : neueEinladung(jetzt)
      await this.repository.upsert(userId, steuerjahr, {
        veranlagungsart: 'zusammen',
        personBUserId: bleibt ? existing.personBUserId : schattenId(userId, steuerjahr),
        ...einladung,
      })
    } else {
      await this.repository.upsert(userId, steuerjahr, {
        veranlagungsart: 'einzel',
        personBUserId: '',
        einladungsCode: null,
        einladungsCodeGueltigBis: null,
      })
    }

    return this.get(userId, steuerjahr)
  }

  async updatePersonB(userId: string, steuerjahr: number, data: KopplungPersonBDto): Promise<KopplungResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (!row || row.veranlagungsart !== 'zusammen' || !row.personBUserId) {
      throw new InvalidInputError('NO_ACTIVE_ZUSAMMENVERANLAGUNG', 'There is no active Zusammenveranlagung.')
    }
    if (row.personAUserId !== userId || hatEigenesKonto(row)) {
      throw new ForbiddenError('PERSON_B_OWNS_DATA', 'Person B maintains their data in their own account.')
    }
    if (data.religion && data.religionEinwilligung !== true) {
      throw new InvalidInputError('RELIGION_CONSENT_REQUIRED', 'religion requires religionEinwilligung = true (Art. 9 DSGVO).')
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
      const bisher = (await this.stammdatenRepository.findByUserId(spouseUserId)) ?? leereStammdaten()
      const religion = data.religion !== undefined ? data.religion : bisher.religion
      await this.stammdatenRepository.speichere(spouseUserId, {
        ...bisher,
        geburtsdatum: data.geburtsdatum ?? bisher.geburtsdatum,
        beruf: data.beruf ?? bisher.beruf,
        religion,
        familienstand: 'verheiratet',
        religionEinwilligungAm:
          religion === null ? null : data.religion ? new Date() : bisher.religionEinwilligungAm,
      })
    }

    return this.get(userId, steuerjahr)
  }

  async joinWithCode(userId: string, steuerjahr: number, code: string, jetzt = new Date()): Promise<KopplungResponseDto> {
    const row = await this.repository.findByEinladungsCode(code)
    if (!row || row.steuerjahr !== steuerjahr) {
      throw new NotFoundError('INVITATION_CODE_INVALID', 'The invitation code is invalid.')
    }
    if (!einladungGueltig(row, jetzt)) {
      throw new NotFoundError('INVITATION_CODE_EXPIRED', 'The invitation code has expired.')
    }
    if (row.personAUserId === userId) {
      throw new InvalidInputError('INVITATION_IS_OWN', 'You cannot couple with your own invitation.')
    }
    await this.repository.setPersonB(row.id, userId)
    return this.get(userId, steuerjahr)
  }
}
