import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { LSTB_FELDER, RENTEN_FELDER, VERMIETUNG_FELDER, kennzeichnungsKey, type Herkunft, type Maske } from '@steuereule/core'
import { BestaetigungService } from '../bestaetigung/bestaetigung.service.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRecord, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { JAHRESUEBERNAHME_REPOSITORY, type JahresuebernahmeRepository } from './jahresuebernahme.repository.js'
import type { UebernahmeResponseDto } from './dto/uebernahme-response.dto.js'

export const MAX_RUECKJAHRE = 4

function vonUebernahme(r: KennzeichnungRecord): boolean {
  return r.herkunft.art === 'uebernahme' || r.vorschlag?.herkunft.art === 'uebernahme'
}

/** Application logic for the Jahresübernahme. */
@Injectable()
export class UebernahmeService {
  constructor(
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly repository: KennzeichnungRepository,
    @Inject(BestaetigungService) private readonly bestaetigung: BestaetigungService,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(RENTE_REPOSITORY) private readonly renteRepository: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapitalRepository: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietungRepository: VermietungRepository,
    @Inject(JAHRESUEBERNAHME_REPOSITORY) private readonly jahresuebernahmeRepository: JahresuebernahmeRepository,
  ) {}

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

  async uebernehme(userId: string, steuerjahr: number, vorjahr: number): Promise<UebernahmeResponseDto> {
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
        await this.bestaetigung.schreibe(userId, steuerjahr, kennzeichnungsKey(maske, feld, instanz), quelle[feld], herkunft)
      }
    }
    if (lstbQuelle !== null) await kopiere('lstb', LSTB_FELDER, lstbQuelle)
    if (renteQuelle !== null) await kopiere('rente', ['rentenart' as const, ...RENTEN_FELDER], renteQuelle)
    if (kapitalQuelle !== null) await kopiere('kapital', ['kapitalertraege' as const], kapitalQuelle)
    for (const objekt of vermietungQuellen) {
      const kopie = await this.vermietungRepository.create(userId, steuerjahr)
      await kopiere('vermietung', VERMIETUNG_FELDER, objekt, kopie.id)
    }

    await this.jahresuebernahmeRepository.record(userId, steuerjahr, vorjahr)

    return this.kennzeichnungen(userId, steuerjahr)
  }
}
