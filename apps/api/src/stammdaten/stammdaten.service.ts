import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import { normalisiereIban } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import type { PutStammdatenDto, StammdatenResponseDto } from './dto/stammdaten.dto.js'
import {
  STAMMDATEN_FELDER,
  STAMMDATEN_REPOSITORY,
  type StammdatenFeld,
  type StammdatenRecord,
  type StammdatenRepository,
} from './stammdaten.repository.js'

const PFLICHT_FUER_AUSDRUCK: readonly StammdatenFeld[] = [
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
export class StammdatenService {
  constructor(
    @Inject(STAMMDATEN_REPOSITORY) private readonly repository: StammdatenRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async lese(userId: string): Promise<StammdatenResponseDto> {
    const record = await this.repository.findByUserId(userId)
    if (record) await this.auditService.append({ userId, action: 'READ', resource: 'stammdaten' })
    return toResponse(record)
  }

  async speichere(userId: string, dto: PutStammdatenDto, jetzt = new Date()): Promise<StammdatenResponseDto> {
    const religion = dto.religion ?? null
    if (religion !== null && dto.religionEinwilligung !== true) {
      throw new InvalidInputError('RELIGION_CONSENT_REQUIRED', 'religion requires religionEinwilligung = true (Art. 9 DSGVO).')
    }
    const bisher = await this.repository.findByUserId(userId)
    const record = { religionEinwilligungAm: null } as StammdatenRecord
    for (const feld of STAMMDATEN_FELDER) record[feld] = trimOrNull(dto[feld])
    if (record.iban !== null) record.iban = normalisiereIban(record.iban)
    if (record.familienstand === 'ledig') record.familienstandSeit = null
    record.religionEinwilligungAm =
      religion === null ? null : bisher?.religion === religion ? (bisher.religionEinwilligungAm ?? jetzt) : jetzt
    return toResponse(await this.repository.speichere(userId, record))
  }
}

function trimOrNull(wert: string | null | undefined): string | null {
  const getrimmt = wert?.trim()
  return getrimmt ? getrimmt : null
}

export function toResponse(record: StammdatenRecord | null): StammdatenResponseDto {
  const response = {} as StammdatenResponseDto
  for (const feld of STAMMDATEN_FELDER) response[feld] = record?.[feld] ?? null
  response.fehlend = PFLICHT_FUER_AUSDRUCK.filter((feld) => response[feld] === null)
  return response
}
