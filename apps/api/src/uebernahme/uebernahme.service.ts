// Application logic for die Jahresübernahme (ticket 10.8, Produkt-ADR-021). The COPY is done
// here — the pure contract of the copy (Herkunft „Übernahme aus {vorjahr}", unbestätigt) lives in
// @steuereule/core's uebernahme.ts; this service moves the FACTS (LStB, Rente, Kapital, every
// Vermietungsobjekt) and records one Kennzeichnung per copied fact. The take-over is ONE action
// per target year: a year that was already taken over is a 409 (never a silent duplicate or a
// half-copy), a source year without ANY take-over-able fact is a 404 (never a fabricated copy),
// and the copied field strings travel UNVERÄNDERT (open stays open, ADR-032).
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import {
  UEBERNAHME_REPOSITORY,
  type UebernahmeKennzeichnungRecord,
  type UebernahmeRepository,
} from './uebernahme.repository.js'
import type { UebernahmeResponseDto } from './dto/uebernahme-response.dto.js'

/** The stable keys of the copied facts — one Kennzeichnung per fact (per object for Vermietung). */
export const UEBERNAHME_POSTEN_KEYS = {
  lstb: 'lstb',
  rente: 'rente',
  kapital: 'kapital',
  /** Vermietung is per object: the key is `vermietung-<objektId>` of the COPIED object. */
  vermietung: (objektId: string) => `vermietung-${objektId}`,
} as const

/** ADR-022: die Übernahme unterstützt höchstens 4 Rückjahre — nie eine stille Alt-Kopie. */
export const MAX_RUECKJAHRE = 4

@Injectable()
export class UebernahmeService {
  constructor(
    @Inject(UEBERNAHME_REPOSITORY) private readonly repository: UebernahmeRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(RENTE_REPOSITORY) private readonly renteRepository: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapitalRepository: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietungRepository: VermietungRepository,
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
   * Die Jahresübernahme — EIN Kopier-Schritt pro Zieljahr: alles aus dem Vorjahr wird kopiert
   * (LStB, Rente, Kapital, jedes Vermietungsobjekt), je Fakt eine UNBESTÄTIGTE Kennzeichnung
   * (ADR-021). Die gespeicherten Feld-Strings reisen unverändert (offen bleibt offen, ADR-032).
   * Ein bereits übernommenes Jahr ist ein 409; ein Vorjahr ohne einen einzigen übernehmbaren
   * Fakt ist ein 404.
   */
  async uebernehme(userId: string, steuerjahr: number, vorjahr: number): Promise<UebernahmeResponseDto> {
    if (!Number.isInteger(vorjahr) || vorjahr < 1 || vorjahr >= steuerjahr) {
      throw new BadRequestException('von must be a whole year strictly before the target year.')
    }
    // ADR-022: bis zu 4 Rückjahre werden unterstützt und beworben — nie eine stille Alt-Kopie.
    if (vorjahr < steuerjahr - MAX_RUECKJAHRE) {
      throw new BadRequestException(`von is more than ${MAX_RUECKJAHRE} years back — at most 4 previous years are supported.`)
    }
    const existing = await this.repository.listForUserAndYear(userId, steuerjahr)
    if (existing.length > 0) {
      throw new ConflictException('This year was already taken over — confirm the copied facts, never copy them twice.')
    }

    const [lstbQuelle, renteQuelle, kapitalQuelle, vermietungQuellen] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, vorjahr),
      this.renteRepository.findForUserAndYear(userId, vorjahr),
      this.kapitalRepository.findForUserAndYear(userId, vorjahr),
      this.vermietungRepository.listForUserAndYear(userId, vorjahr),
    ])

    let kopiert = 0
    if (lstbQuelle !== null) {
      // Copy the stored field strings unchanged — the honest states travel with them.
      await this.lstbRepository.setFeld(userId, steuerjahr, 'bruttoarbeitslohn', lstbQuelle.bruttoarbeitslohn)
      await this.lstbRepository.setFeld(userId, steuerjahr, 'lohnsteuer', lstbQuelle.lohnsteuer)
      await this.lstbRepository.setFeld(userId, steuerjahr, 'sozialversicherung', lstbQuelle.sozialversicherung)
      await this.repository.create(userId, steuerjahr, vorjahr, UEBERNAHME_POSTEN_KEYS.lstb)
      kopiert += 1
    }
    if (renteQuelle !== null) {
      await this.renteRepository.setRentenart(userId, steuerjahr, renteQuelle.rentenart)
      await this.renteRepository.setFeld(userId, steuerjahr, 'jahresbetrag', renteQuelle.jahresbetrag)
      await this.renteRepository.setFeld(userId, steuerjahr, 'rentenbeginnJahr', renteQuelle.rentenbeginnJahr)
      await this.renteRepository.setFeld(userId, steuerjahr, 'alterBeiRentenbeginn', renteQuelle.alterBeiRentenbeginn)
      await this.repository.create(userId, steuerjahr, vorjahr, UEBERNAHME_POSTEN_KEYS.rente)
      kopiert += 1
    }
    if (kapitalQuelle !== null) {
      await this.kapitalRepository.setFeld(userId, steuerjahr, 'kapitalertraege', kapitalQuelle.kapitalertraege)
      await this.repository.create(userId, steuerjahr, vorjahr, UEBERNAHME_POSTEN_KEYS.kapital)
      kopiert += 1
    }
    for (const objekt of vermietungQuellen) {
      const kopie = await this.vermietungRepository.create(userId, steuerjahr)
      await this.vermietungRepository.setFeld(userId, steuerjahr, kopie.id, 'mieteinnahmen', objekt.mieteinnahmen)
      await this.vermietungRepository.setFeld(userId, steuerjahr, kopie.id, 'anschaffungskosten', objekt.anschaffungskosten)
      await this.vermietungRepository.setFeld(userId, steuerjahr, kopie.id, 'baujahr', objekt.baujahr)
      await this.vermietungRepository.setFeld(userId, steuerjahr, kopie.id, 'werbungskosten', objekt.werbungskosten)
      await this.repository.create(userId, steuerjahr, vorjahr, UEBERNAHME_POSTEN_KEYS.vermietung(kopie.id))
      kopiert += 1
    }

    if (kopiert === 0) {
      throw new NotFoundException(`Nothing to take over from ${vorjahr} — no LStB, Rente, Kapital or Vermietung exists.`)
    }

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
