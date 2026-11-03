// Erklärungs-Stammdaten (ADR-0050). PUT replaces the whole record, like PUT /v1/profile:
// an omitted field is "not given", stored as null — never a stale value kept by accident.
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
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

/** What ESt 1 A cannot do without (Zeilen 8–18 and the Bankverbindung). Hausnummer-
 *  Zusatz, Telefon, Kontoinhaber and the Familienstand date are optional on the form. */
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
    // Art. 9 DSGVO: a religion key is only accepted with explicit consent in the same request.
    if (religion !== null && dto.religionEinwilligung !== true) {
      throw new BadRequestException('religion requires religionEinwilligung = true (Art. 9 DSGVO)')
    }
    const bisher = await this.repository.findByUserId(userId)
    const record = { religionEinwilligungAm: null } as StammdatenRecord
    for (const feld of STAMMDATEN_FELDER) record[feld] = trimOrNull(dto[feld])
    if (record.iban !== null) record.iban = normalisiereIban(record.iban)
    if (record.familienstand === 'ledig') record.familienstandSeit = null
    // Keep the original consent date while the same religion stays stored.
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
