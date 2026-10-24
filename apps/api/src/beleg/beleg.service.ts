// Application logic for the Beleg-Posteingang (ADR-007/008): userId-scoped reads/writes,
// then the derived-Zuordnung mapping. Trusts that `userId` was produced by
// UserContextGuard (never accepts it from a param/body) — mirrors ProfileService/
// CockpitService. The Zuordnung state is NEVER computed here — @steuereule/core's
// `zuordnungAusDaten` is imported, never reimplemented (ADR-014/048 determinism boundary).
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { zuordnungAusDaten, type BelegZuordnung } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { BELEG_REPOSITORY, type BelegRecord, type BelegRepository } from './beleg.repository.js'
import type { BelegResponseDto } from './dto/beleg-response.dto.js'
import type { CreateBelegDto } from './dto/create-beleg.dto.js'
import type { SetZuordnungDto } from './dto/set-zuordnung.dto.js'
import type { ZuordnungDto } from './dto/zuordnung.dto.js'

/** The flat wire shape of the core's discriminated union — see ZuordnungDto. */
function toZuordnungDto(zuordnung: BelegZuordnung): ZuordnungDto {
  switch (zuordnung.kind) {
    case 'ungebunden':
      return { kind: 'ungebunden' }
    case 'vorgeschlagen':
      return { kind: 'vorgeschlagen', steuerjahr: zuordnung.vorschlag.steuerjahr, herkunft: zuordnung.vorschlag.herkunft }
    case 'zugeordnet':
      return { kind: 'zugeordnet', steuerjahr: zuordnung.steuerjahr }
    case 'konflikt':
      return {
        kind: 'konflikt',
        steuerjahr: zuordnung.zugeordnet,
        vorschlagsJahr: zuordnung.vorschlag.steuerjahr,
        herkunft: zuordnung.vorschlag.herkunft,
      }
  }
}

function toBelegResponse(record: BelegRecord): BelegResponseDto {
  return {
    id: record.id,
    dateiname: record.dateiname,
    art: record.art ?? null,
    belegdatum: record.belegdatum ?? null,
    zahlungsdatum: record.zahlungsdatum ?? null,
    zuordnung: toZuordnungDto(zuordnungAusDaten(record)),
  }
}

@Injectable()
export class BelegService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(BELEG_REPOSITORY) private readonly repository: BelegRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async list(userId: string): Promise<BelegResponseDto[]> {
    const rows = await this.repository.findAllForUser(userId)
    // Only log an access when there's something to access (REQ-004.2's pattern) — an
    // empty inbox appends no READ entry.
    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    }
    return rows.map(toBelegResponse)
  }

  async create(userId: string, dto: CreateBelegDto): Promise<BelegResponseDto> {
    const record = await this.repository.create(userId, {
      dateiname: dto.dateiname,
      ...(dto.art !== undefined ? { art: dto.art } : {}),
      ...(dto.belegdatum !== undefined ? { belegdatum: dto.belegdatum } : {}),
      ...(dto.zahlungsdatum !== undefined ? { zahlungsdatum: dto.zahlungsdatum } : {}),
    })
    return toBelegResponse(record)
  }

  async setZuordnung(userId: string, id: string, dto: SetZuordnungDto): Promise<BelegResponseDto> {
    const record = await this.repository.setSteuerjahr(userId, id, dto.steuerjahr)
    if (record === null) {
      // Honest 404, never a 403: a missing/foreign id is indistinguishable from "not yours"
      // and must not leak the existence of another user's Beleg.
      throw new NotFoundException(`Beleg "${id}" does not exist for this account.`)
    }
    return toBelegResponse(record)
  }
}
