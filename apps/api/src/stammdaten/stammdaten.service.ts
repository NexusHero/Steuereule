import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import { normalizeIban } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import type { PutMasterDataDto, MasterDataResponseDto } from './dto/stammdaten.dto.js'
import {
  MASTER_DATA_FIELDS,
  MASTER_DATA_REPOSITORY,
  type MasterDataField,
  type MasterDataRecord,
  type MasterDataRepository,
} from './stammdaten.repository.js'

const REQUIRED_FOR_PRINTOUT: readonly MasterDataField[] = [
  'geburtsdatum',
  'strasse',
  'hausnummer',
  'plz',
  'wohnort',
  'religion',
  'familienstand',
  'iban',
  'finanzamt',
]

/** Erklärungs-Stammdaten. */
@Injectable()
export class MasterDataService {
  constructor(
    @Inject(MASTER_DATA_REPOSITORY) private readonly repository: MasterDataRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async read(userId: string): Promise<MasterDataResponseDto> {
    const record = await this.repository.findByUserId(userId)
    if (record) await this.auditService.append({ userId, action: 'READ', resource: 'stammdaten' })
    return toResponse(record)
  }

  async save(userId: string, dto: PutMasterDataDto, now = new Date()): Promise<MasterDataResponseDto> {
    const religion = dto.religion ?? null
    if (religion !== null && dto.religionConsent !== true) {
      throw new InvalidInputError('RELIGION_CONSENT_REQUIRED', 'religion requires religionConsent = true (Art. 9 DSGVO).')
    }
    const previous = await this.repository.findByUserId(userId)
    const record = { religionEinwilligungAm: null } as MasterDataRecord
    for (const field of MASTER_DATA_FIELDS) record[field] = trimOrNull(dto[field])
    if (record.iban !== null) record.iban = normalizeIban(record.iban)
    if (record.familienstand === 'ledig') record.familienstandSeit = null
    record.religionEinwilligungAm =
      religion === null ? null : previous?.religion === religion ? (previous.religionEinwilligungAm ?? now) : now
    return toResponse(await this.repository.save(userId, record))
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function toResponse(record: MasterDataRecord | null): MasterDataResponseDto {
  const response = {} as MasterDataResponseDto
  for (const field of MASTER_DATA_FIELDS) response[field] = record?.[field] ?? null
  response.missing = REQUIRED_FOR_PRINTOUT.filter((field) => response[field] === null)
  return response
}
