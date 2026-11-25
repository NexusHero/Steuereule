import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import { normalizeIban } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import type { PutMasterDataDto, MasterDataResponseDto } from './dto/master-data.dto.js'
import {
  MASTER_DATA_FIELDS,
  MASTER_DATA_REPOSITORY,
  type MasterDataField,
  type MasterDataRecord,
  type MasterDataRepository,
} from './master-data.repository.js'

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

  /**
   * Changes only the fields the request carries (WEB-29): an absent field keeps its stored value, an explicit
   * `null` or blank clears it. A client that failed to load the Stammdaten can no longer wipe what it never saw.
   */
  async save(userId: string, dto: PutMasterDataDto, now = new Date()): Promise<MasterDataResponseDto> {
    const religionSent = dto.religion !== undefined
    if (religionSent && trimOrNull(dto.religion) !== null && dto.religionConsent !== true) {
      throw new InvalidInputError('RELIGION_CONSENT_REQUIRED', 'religion requires religionConsent = true (Art. 9 DSGVO).')
    }
    const previous = await this.repository.findByUserId(userId)
    // The form does not know the yes/no an assistant may have set (ADR-0052 amendment 3): it stays.
    const record = { religionEinwilligungAm: null, kirchensteuerpflichtig: previous?.kirchensteuerpflichtig ?? null } as MasterDataRecord
    for (const field of MASTER_DATA_FIELDS) {
      record[field] = dto[field] === undefined ? (previous?.[field] ?? null) : trimOrNull(dto[field])
    }
    if (record.iban !== null) record.iban = normalizeIban(record.iban)
    if (record.familienstand === 'ledig') record.familienstandSeit = null
    const religion = record.religion
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
