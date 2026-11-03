// Application logic for die Jahresübernahme (ticket 10.8, Produkt-ADR-021). The COPY is done
// here — the pure contract of the copy (Herkunft „Übernahme aus {vorjahr}", unbestätigt) lives in
// @steuereule/core's uebernahme.ts; this service moves the FACTS (LStB, Rente, Kapital, every
// Vermietungsobjekt) through the generic Kennzeichnungs-Schicht (ADR-0052 §6). The take-over is ONE action
// per target year: a year that was already taken over is a 409 (never a silent duplicate or a
// half-copy), a source year without ANY take-over-able fact is a 404 (never a fabricated copy),
// and the copied field strings travel UNVERÄNDERT (open stays open, ADR-032).
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { LSTB_FELDER, RENTEN_FELDER, VERMIETUNG_FELDER, kennzeichnungsKey, type Herkunft, type Maske } from '@steuereule/core'
import { BestaetigungService } from '../bestaetigung/bestaetigung.service.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRecord, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import type { UebernahmeResponseDto } from './dto/uebernahme-response.dto.js'

/** ADR-022: die Übernahme unterstützt höchstens 4 Rückjahre — nie eine stille Alt-Kopie. */
export const MAX_RUECKJAHRE = 4

function vonUebernahme(r: KennzeichnungRecord): boolean {
  return r.herkunft.art === 'uebernahme' || r.vorschlag?.herkunft.art === 'uebernahme'
}

@Injectable()
export class UebernahmeService {
  constructor(
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly repository: KennzeichnungRepository,
    @Inject(BestaetigungService) private readonly bestaetigung: BestaetigungService,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(RENTE_REPOSITORY) private readonly renteRepository: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapitalRepository: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietungRepository: VermietungRepository,
  ) {}

  /** The values the take-over itself marked (an open proposal is the user's value, not a copy). */
  private async kennzeichnungen(userId: string, steuerjahr: number): Promise<UebernahmeResponseDto> {
    const records = await this.repository.listForUserAndYears(userId, [steuerjahr])
    return {
      kennzeichnungen: records.flatMap((r) =>
        r.herkunft.art === 'uebernahme' ? [{ postenKey: r.key, vorjahr: r.herkunft.vorjahr, bestaetigt: r.bestaetigt }] : [],
      ),
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<UebernahmeResponseDto> {
    return this.kennzeichnungen(userId, steuerjahr)
  }

  /**
   * Die Jahresübernahme — EIN Kopier-Schritt pro Zieljahr: alles aus dem Vorjahr wird kopiert
   * (LStB, Rente, Kapital, jedes Vermietungsobjekt), je Feld über die Kennzeichnungs-Schicht —
   * unbestätigt (ADR-021), und ein schon eingetragener Wert des Nutzers gewinnt (ADR-0052 §7).
   * Ein bereits übernommenes Jahr ist ein 409; ein Vorjahr ohne übernehmbaren Fakt ein 404.
   */
  async uebernehme(userId: string, steuerjahr: number, vorjahr: number): Promise<UebernahmeResponseDto> {
    if (!Number.isInteger(vorjahr) || vorjahr < 1 || vorjahr >= steuerjahr) {
      throw new BadRequestException('von must be a whole year strictly before the target year.')
    }
    // ADR-022: bis zu 4 Rückjahre werden unterstützt und beworben — nie eine stille Alt-Kopie.
    if (vorjahr < steuerjahr - MAX_RUECKJAHRE) {
      throw new BadRequestException(`von is more than ${MAX_RUECKJAHRE} years back — at most 4 previous years are supported.`)
    }
    const existing = await this.repository.listForUserAndYears(userId, [steuerjahr])
    if (existing.some(vonUebernahme)) {
      throw new ConflictException('This year was already taken over — confirm the copied facts, never copy them twice.')
    }

    const [lstbQuelle, renteQuelle, kapitalQuelle, vermietungQuellen] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, vorjahr),
      this.renteRepository.findForUserAndYear(userId, vorjahr),
      this.kapitalRepository.findForUserAndYear(userId, vorjahr),
      this.vermietungRepository.listForUserAndYear(userId, vorjahr),
    ])
    if (lstbQuelle === null && renteQuelle === null && kapitalQuelle === null && vermietungQuellen.length === 0) {
      throw new NotFoundException(`Nothing to take over from ${vorjahr} — no LStB, Rente, Kapital or Vermietung exists.`)
    }

    const herkunft: Herkunft = { art: 'uebernahme', vorjahr }
    const kopiere = async <F extends string>(maske: Maske, felder: readonly F[], quelle: Readonly<Record<F, string | null>>, instanz?: string) => {
      // Copy the stored field strings unchanged — the honest states travel with them.
      for (const feld of felder) {
        await this.bestaetigung.schreibe(userId, steuerjahr, kennzeichnungsKey(maske, feld, instanz), quelle[feld], herkunft)
      }
    }
    if (lstbQuelle !== null) await kopiere('lstb', LSTB_FELDER, lstbQuelle)
    if (renteQuelle !== null) await kopiere('rente', ['rentenart' as const, ...RENTEN_FELDER], renteQuelle)
    // The take-over has always carried only the Kapitalerträge (the guided mask's other fields are year-specific).
    if (kapitalQuelle !== null) await kopiere('kapital', ['kapitalertraege' as const], kapitalQuelle)
    for (const objekt of vermietungQuellen) {
      const kopie = await this.vermietungRepository.create(userId, steuerjahr)
      await kopiere('vermietung', VERMIETUNG_FELDER, objekt, kopie.id)
    }

    return this.kennzeichnungen(userId, steuerjahr)
  }
}
