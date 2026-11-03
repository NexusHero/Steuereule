import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { STAMMDATEN_REPOSITORY, type StammdatenRepository } from '../stammdaten/stammdaten.repository.js'
import { KOPPLUNG_REPOSITORY, type KopplungRepository } from './kopplung.repository.js'
import type { KopplungPersonBDto, KopplungResponseDto, SetKopplungDto } from './dto/kopplung.dto.js'

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
      personB,
    }
  }

  async set(userId: string, steuerjahr: number, dto: SetKopplungDto): Promise<KopplungResponseDto> {
    let personBUserId = dto.personBUserId
    let einladungsCode: string | null = null

    if (dto.veranlagungsart === 'zusammen') {
      if (!personBUserId) {
        // If no explicit personBUserId is provided, check if existing row has one or create shadow
        const existing = await this.repository.findByUserAndYear(userId, steuerjahr)
        if (existing?.personBUserId) {
          personBUserId = existing.personBUserId
          einladungsCode = existing.einladungsCode
        } else {
          // Generate a shadow ID for 1-account switching mode + invite code
          personBUserId = `spouse_${userId}_${steuerjahr}`
          einladungsCode = randomBytes(4).toString('hex').toUpperCase()
        }
      }
    } else {
      personBUserId = ''
    }

    await this.repository.upsert(userId, steuerjahr, {
      personBUserId: personBUserId || '',
      veranlagungsart: dto.veranlagungsart,
      einladungsCode,
    })

    return this.get(userId, steuerjahr)
  }

  async updatePersonB(
    userId: string,
    steuerjahr: number,
    data: {
      firstName?: string | null
      lastName?: string | null
      steuerId?: string | null
      geburtsdatum?: string | null
      religion?: string | null
      beruf?: string | null
    },
  ): Promise<KopplungResponseDto> {
    const row = await this.repository.findByUserAndYear(userId, steuerjahr)
    if (!row || row.veranlagungsart !== 'zusammen' || !row.personBUserId) {
      throw new BadRequestException('Keine aktive Zusammenveranlagung.')
    }

    const spouseUserId = row.personAUserId === userId ? row.personBUserId : row.personAUserId

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
      const sd = await this.stammdatenRepository.findByUserId(spouseUserId)
      await this.stammdatenRepository.speichere(spouseUserId, {
        geburtsdatum: data.geburtsdatum ?? sd?.geburtsdatum ?? null,
        strasse: sd?.strasse ?? null,
        hausnummer: sd?.hausnummer ?? null,
        hausnummerZusatz: sd?.hausnummerZusatz ?? null,
        plz: sd?.plz ?? null,
        wohnort: sd?.wohnort ?? null,
        religion: data.religion ?? sd?.religion ?? null,
        beruf: data.beruf ?? sd?.beruf ?? null,
        familienstand: 'verheiratet',
        familienstandSeit: sd?.familienstandSeit ?? null,
        iban: sd?.iban ?? null,
        kontoinhaber: sd?.kontoinhaber ?? null,
        finanzamt: sd?.finanzamt ?? null,
        telefon: sd?.telefon ?? null,
        religionEinwilligungAm: sd?.religionEinwilligungAm ?? new Date(),
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
