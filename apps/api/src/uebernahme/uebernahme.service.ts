// Application logic for die Jahresübernahme (ticket 10.8, Produkt-ADR-021). The COPY is done
// here — the pure contract of the copy (Herkunft „Übernahme aus {vorjahr}", unbestätigt) lives in
// @steuereule/core's uebernahme.ts; this service moves the FACTS (M1: the LStB row) and records
// the Kennzeichnung. Idempotent by design: a second copy of the same year is a 409, never a
// silent duplicate (the Kennzeichnung's unique key enforces it at the DB too).
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import {
  UEBERNAHME_REPOSITORY,
  type UebernahmeKennzeichnungRecord,
  type UebernahmeRepository,
} from './uebernahme.repository.js'
import type { UebernahmeResponseDto } from './dto/uebernahme-response.dto.js'

@Injectable()
export class UebernahmeService {
  constructor(
    @Inject(UEBERNAHME_REPOSITORY) private readonly repository: UebernahmeRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
  ) {}

  private toResponse(records: UebernahmeKennzeichnungRecord[]): UebernahmeResponseDto {
    return {
      kennzeichnungen: records.map((r) => ({
        postenKey: r.postenKey,
        vorjahr: r.vorjahr,
        bestaetigt: r.bestaetigt,
      })),
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<UebernahmeResponseDto> {
    return this.toResponse(await this.repository.listForUserAndYear(userId, steuerjahr))
  }

  /**
   * M1: kopiert die LStB-Zeile des Vorjahrs ins Zieljahr (die gespeicherten Feld-Strings,
   * unverändert — nie neu gerechnet) und legt die Kennzeichnung an (unbestätigt, ADR-021).
   * Die übrigen Vertikalen (Rente/Kapital/Vermietung) sind benannte Follow-ups — die
   * Kennzeichnungs-Schicht trägt ihre Schlüssel schon.
   */
  async uebernehme(userId: string, steuerjahr: number, vorjahr: number): Promise<UebernahmeResponseDto> {
    if (!Number.isInteger(vorjahr) || vorjahr < 1 || vorjahr >= steuerjahr) {
      throw new BadRequestException('von must be a whole year strictly before the target year.')
    }
    const existing = await this.repository.findForUserAndYearAndKey(userId, steuerjahr, 'lstb')
    if (existing !== null) {
      throw new ConflictException('The LStB of this year was already taken over — confirm it, never copy it twice.')
    }

    const quellRecord = await this.lstbRepository.findForUserAndYear(userId, vorjahr)
    if (quellRecord === null) {
      throw new NotFoundException(`No LStB exists for ${vorjahr} to take over.`)
    }

    // Copy the stored field strings unchanged — the honest states travel with them.
    await this.lstbRepository.setFeld(userId, steuerjahr, 'bruttoarbeitslohn', quellRecord.bruttoarbeitslohn)
    await this.lstbRepository.setFeld(userId, steuerjahr, 'lohnsteuer', quellRecord.lohnsteuer)
    await this.lstbRepository.setFeld(userId, steuerjahr, 'sozialversicherung', quellRecord.sozialversicherung)
    await this.repository.create(userId, steuerjahr, vorjahr, 'lstb')

    return this.toResponse(await this.repository.listForUserAndYear(userId, steuerjahr))
  }

  /** ADR-021 — der Bestätigungs-Schritt: angetippt oder ein Beleg deckt den Posten. */
  async bestaetige(userId: string, steuerjahr: number, postenKey: string): Promise<UebernahmeResponseDto> {
    const record = await this.repository.bestaetige(userId, steuerjahr, postenKey)
    if (record === null) {
      throw new NotFoundException(`No take-over exists for "${postenKey}" in this tax year.`)
    }
    return this.toResponse(await this.repository.listForUserAndYear(userId, steuerjahr))
  }
}
