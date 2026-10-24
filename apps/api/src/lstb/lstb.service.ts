// Application logic for the LStB guided mask (ADR-036, ticket 08): userId+steuerjahr-scoped
// read/write, then the honest-state mapping. Trusts that `userId` was produced by
// UserContextGuard + @RequiresAccount() (never accepts it from a param/body) — mirrors
// InterviewService/CockpitService. The LStB state is NEVER computed here —
// @steuereule/core's `deserialisiereLstbFeld`/`serialisiereLstbFeld`/`lstbZustand`/
// `setzeLstbFeld` are imported, never reimplemented (ADR-014/048 determinism boundary).
// Scan/OCR is deliberately OUT of scope (ADR-045, a later slice) — this is the DATA
// interface and the honest states only.
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  LEERES_LSTB,
  deserialisiereLstbFeld,
  istGueltigerBetrag,
  lstbZustand,
  serialisiereLstbFeld,
  setzeLstbFeld,
  type LstbDaten,
  type LstbFeldId,
  type LstbFeldZustand,
  type LstbZustand,
  type LstbWiderspruch,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { LSTB_REPOSITORY, type LstbRecord, type LstbRepository } from './lstb.repository.js'
import type { LstbFeldDto } from './dto/lstb-feld.dto.js'
import type { LstbResponseDto } from './dto/lstb-response.dto.js'
import type { LstbWiderspruchDto } from './dto/lstb-widerspruch.dto.js'
import type { LstbZustandDto } from './dto/lstb-zustand.dto.js'

/** A stored row (or none) → the core's LstbDaten, via the ONE encoding in core/lstb.ts. */
function datenAusRecord(record: LstbRecord | null): LstbDaten {
  if (record === null) return LEERES_LSTB
  return {
    bruttoarbeitslohn: deserialisiereLstbFeld(record.bruttoarbeitslohn),
    lohnsteuer: deserialisiereLstbFeld(record.lohnsteuer),
    sozialversicherung: deserialisiereLstbFeld(record.sozialversicherung),
  }
}

/** A wire field state → the core's LstbFeldZustand; a 400 when `erfasst` lacks a valid amount. */
function zustandAusDto(dto: LstbFeldDto): LstbFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerBetrag(dto.wert)) {
    throw new BadRequestException('kind "erfasst" requires a non-negative whole-euro `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: LstbFeldZustand): LstbFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function toWiderspruchDto(w: LstbWiderspruch): LstbWiderspruchDto {
  switch (w.art) {
    case 'lohnsteuer-uebersteigt-brutto':
      return { art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: w.lohnsteuer, bruttoarbeitslohn: w.bruttoarbeitslohn }
    case 'sozialversicherung-uebersteigt-brutto':
      return { art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: w.sozialversicherung, bruttoarbeitslohn: w.bruttoarbeitslohn }
  }
}

function toZustandDto(z: LstbZustand): LstbZustandDto {
  switch (z.kind) {
    case 'unvollstaendig':
      return { kind: 'unvollstaendig', offen: [...z.offen], unklar: [...z.unklar] }
    case 'widerspruch':
      return { kind: 'widerspruch', widersprueche: z.widersprueche.map(toWiderspruchDto) }
    case 'vollstaendig':
      return { kind: 'vollstaendig', bruttoarbeitslohn: z.bruttoarbeitslohn, lohnsteuer: z.lohnsteuer, sozialversicherung: z.sozialversicherung }
  }
}

function toResponse(daten: LstbDaten): LstbResponseDto {
  return {
    bruttoarbeitslohn: toFeldDto(daten.bruttoarbeitslohn),
    lohnsteuer: toFeldDto(daten.lohnsteuer),
    sozialversicherung: toFeldDto(daten.sozialversicherung),
    zustand: toZustandDto(lstbZustand(daten)),
  }
}

@Injectable()
export class LstbService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(LSTB_REPOSITORY) private readonly repository: LstbRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getState(userId: string, steuerjahr: number): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    // Only log an access when there's something to access (REQ-004.2's pattern) — a GET on a
    // fresh tax year with no mask started yet appends no READ entry.
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    }
    return toResponse(datenAusRecord(record))
  }

  async setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, dto: LstbFeldDto): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    // `setzeLstbFeld` is the core's own invariant guard (throws on an invalid `erfasst`
    // value) — defense in depth behind the explicit 400 in `zustandAusDto`, never expected
    // to fire on the happy path.
    const next = setzeLstbFeld(daten, feld, zustand)
    await this.repository.setFeld(userId, steuerjahr, feld, serialisiereLstbFeld(zustand))
    return toResponse(next)
  }
}
