import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
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

// Until the partner joins with the invite code, Person A fills in Person B's data on a
// shadow id. Once a real account sits there, that data is the partner's own and only the
// partner may change it.
const SCHATTEN_PRAEFIX = 'spouse_'

function schattenId(userId: string, steuerjahr: number): string {
  return `${SCHATTEN_PRAEFIX}${userId}_${steuerjahr}`
}

function hatEigenesKonto(row: SteuerjahrKopplungRecord): boolean {
  return row.personBUserId !== '' && !row.personBUserId.startsWith(SCHATTEN_PRAEFIX)
}

// 64 bits: the code is the only credential that links two accounts, and it does not expire.
function neuerEinladungsCode(): string {
  return randomBytes(8).toString('hex').toUpperCase()
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
      personBHatEigenesKonto: hatEigenesKonto(row),
      personB,
    }
  }

  async set(userId: string, steuerjahr: number, dto: SetKopplungDto): Promise<KopplungResponseDto> {
    const existing = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (existing && existing.personAUserId !== userId) {
      throw new ForbiddenException('Die Veranlagungsart legt Person A fest.')
    }

    if (dto.veranlagungsart === 'zusammen') {
      const bleibt = existing?.veranlagungsart === 'zusammen' && existing.personBUserId !== ''
      await this.repository.upsert(userId, steuerjahr, {
        veranlagungsart: 'zusammen',
        personBUserId: bleibt ? existing.personBUserId : schattenId(userId, steuerjahr),
        einladungsCode: bleibt ? existing.einladungsCode : neuerEinladungsCode(),
      })
    } else {
      await this.repository.upsert(userId, steuerjahr, {
        veranlagungsart: 'einzel',
        personBUserId: '',
        einladungsCode: null,
      })
    }

    return this.get(userId, steuerjahr)
  }

  async updatePersonB(userId: string, steuerjahr: number, data: KopplungPersonBDto): Promise<KopplungResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (!row || row.veranlagungsart !== 'zusammen' || !row.personBUserId) {
      throw new BadRequestException('Keine aktive Zusammenveranlagung.')
    }
    if (row.personAUserId !== userId || hatEigenesKonto(row)) {
      throw new ForbiddenException('Person B pflegt ihre Angaben im eigenen Konto.')
    }
    // Art. 9 DSGVO, same rule as the own Stammdaten: no religion without explicit consent.
    if (data.religion && data.religionEinwilligung !== true) {
      throw new BadRequestException('religion requires religionEinwilligung = true (Art. 9 DSGVO)')
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

  async joinWithCode(userId: string, steuerjahr: number, code: string): Promise<KopplungResponseDto> {
    const row = await this.repository.findByEinladungsCode(code)
    if (!row || row.steuerjahr !== steuerjahr) {
      throw new NotFoundException('Ungültiger Einladungscode.')
    }
    if (row.personAUserId === userId) {
      throw new BadRequestException('Man kann sich nicht mit der eigenen Einladung koppeln.')
    }
    await this.repository.setPersonB(row.id, userId)
    return this.get(userId, steuerjahr)
  }
}
