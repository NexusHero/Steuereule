import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { WAGE_TAX_CERTIFICATE_FIELDS, PENSION_FIELDS, RENTAL_FIELDS, provenanceKey, type Herkunft, type Maske } from '@steuereule/core'
import { ConfirmationService } from '../bestaetigung/bestaetigung.service.js'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../kapital/kapital.repository.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRecord, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../rente/rente.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../vermietung/vermietung.repository.js'
import { TAX_YEAR_ROLLOVER_REPOSITORY, type TaxYearRolloverRepository } from './jahresuebernahme.repository.js'
import type { RolloverResponseDto } from './dto/uebernahme-response.dto.js'

export const MAX_RUECKJAHRE = 4

function vonUebernahme(r: ProvenanceRecord): boolean {
  return r.herkunft.art === 'uebernahme' || r.vorschlag?.herkunft.art === 'uebernahme'
}

/** Application logic for the Jahresübernahme. */
@Injectable()
export class UebernahmeService {
  constructor(
    @Inject(PROVENANCE_REPOSITORY) private readonly repository: ProvenanceRepository,
    @Inject(ConfirmationService) private readonly bestaetigung: ConfirmationService,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(PENSION_REPOSITORY) private readonly renteRepository: PensionRepository,
    @Inject(CAPITAL_REPOSITORY) private readonly kapitalRepository: CapitalRepository,
    @Inject(RENTAL_REPOSITORY) private readonly vermietungRepository: RentalRepository,
    @Inject(TAX_YEAR_ROLLOVER_REPOSITORY) private readonly jahresuebernahmeRepository: TaxYearRolloverRepository,
  ) {}

  private async kennzeichnungen(userId: string, steuerjahr: number): Promise<RolloverResponseDto> {
    const records = await this.repository.listForUserAndYears(userId, [steuerjahr])
    return {
      kennzeichnungen: records.flatMap((r) =>
        r.herkunft.art === 'uebernahme' ? [{ postenKey: r.key, vorjahr: r.herkunft.vorjahr, bestaetigt: r.bestaetigt }] : [],
      ),
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<RolloverResponseDto> {
    return this.kennzeichnungen(userId, steuerjahr)
  }

  async uebernehme(userId: string, steuerjahr: number, vorjahr: number): Promise<RolloverResponseDto> {
    if (!Number.isInteger(vorjahr) || vorjahr < 1 || vorjahr >= steuerjahr) {
      throw new InvalidInputError('VORJAHR_INVALID', 'von must be a whole year strictly before the target year.')
    }
    if (vorjahr < steuerjahr - MAX_RUECKJAHRE) {
      throw new InvalidInputError('VORJAHR_TOO_FAR_BACK', `von is more than ${MAX_RUECKJAHRE} years back — at most 4 previous years are supported.`)
    }
    const [alreadyTakenOver, existing] = await Promise.all([
      this.jahresuebernahmeRepository.findForUserAndYear(userId, steuerjahr),
      this.repository.listForUserAndYears(userId, [steuerjahr]),
    ])
    if (alreadyTakenOver !== null || existing.some(vonUebernahme)) {
      throw new ConflictError('ALREADY_TAKEN_OVER', 'This tax year was already taken over.')
    }

    const [lstbQuelle, renteQuelle, kapitalQuelle, vermietungQuellen] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, vorjahr),
      this.renteRepository.findForUserAndYear(userId, vorjahr),
      this.kapitalRepository.findForUserAndYear(userId, vorjahr),
      this.vermietungRepository.listForUserAndYear(userId, vorjahr),
    ])
    if (lstbQuelle === null && renteQuelle === null && kapitalQuelle === null && vermietungQuellen.length === 0) {
      throw new NotFoundError('NOTHING_TO_TAKE_OVER', `Nothing to take over from ${vorjahr} — no LStB, Rente, Kapital or Vermietung exists.`)
    }

    const herkunft: Herkunft = { art: 'uebernahme', vorjahr }
    const kopiere = async <F extends string>(maske: Maske, felder: readonly F[], quelle: Readonly<Record<F, string | null>>, instanz?: string) => {
      for (const feld of felder) {
        await this.bestaetigung.schreibe(userId, steuerjahr, provenanceKey(maske, feld, instanz), quelle[feld], herkunft)
      }
    }
    if (lstbQuelle !== null) await kopiere('lstb', WAGE_TAX_CERTIFICATE_FIELDS, lstbQuelle)
    if (renteQuelle !== null) await kopiere('rente', ['rentenart' as const, ...PENSION_FIELDS], renteQuelle)
    if (kapitalQuelle !== null) await kopiere('kapital', ['kapitalertraege' as const], kapitalQuelle)
    for (const objekt of vermietungQuellen) {
      const kopie = await this.vermietungRepository.create(userId, steuerjahr)
      await kopiere('vermietung', RENTAL_FIELDS, objekt, kopie.id)
    }

    await this.jahresuebernahmeRepository.record(userId, steuerjahr, vorjahr)

    return this.kennzeichnungen(userId, steuerjahr)
  }
}
