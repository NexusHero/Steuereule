import { Inject, Injectable } from '@nestjs/common'
import {
  angestellteAusDaten,
  cockpitSpanneAusEingaben,
  type CockpitSpanne,
} from '@steuereule/core'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { KAPITAL_REPOSITORY, type KapitalRepository } from '../kapital/kapital.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { RENTE_REPOSITORY, type RenteRepository } from '../rente/rente.repository.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungRepository } from '../vermietung/vermietung.repository.js'
import { TAX_YEAR_REPOSITORY, type TaxYearRepository } from './tax-year.repository.js'
import type { CockpitStandDto, CockpitSummaryDto } from './dto/cockpit-summary.dto.js'
import { answersAus } from '../interview/answers.js'
import { lstbDatenAus } from '../lstb/lstb-daten.js'

function erfassterWert(raw: string | null): number | null {
  if (raw === null || raw === 'unklar') return null
  if (!/^\d+$/.test(raw)) return null
  return Number(raw)
}

function toStandDto(stand: CockpitSpanne): CockpitStandDto {
  switch (stand.kind) {
    case 'bestimmt':
      return { kind: 'bestimmt', wert: stand.wert }
    case 'spanne':
      return {
        kind: 'spanne',
        von: stand.von,
        bis: stand.bis,
        offenePosten: stand.offenePosten,
        konflikte: stand.konflikte,
        unbestaetigte: stand.unbestaetigte,
        unbestaetigteSumme: stand.unbestaetigteSumme,
      }
    case 'gated':
      return { kind: 'gated', summe: stand.summe, gegated: [...stand.gegated] }
  }
}

/** Application logic: userId+steuerjahr-scoped read, then the honest fold -> wire mapping. */
@Injectable()
export class CockpitService {
  constructor(
    @Inject(TAX_YEAR_REPOSITORY) private readonly taxYearRepository: TaxYearRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly kennzeichnungRepository: KennzeichnungRepository,
    @Inject(RENTE_REPOSITORY) private readonly renteRepository: RenteRepository,
    @Inject(KAPITAL_REPOSITORY) private readonly kapitalRepository: KapitalRepository,
    @Inject(VERMIETUNG_REPOSITORY) private readonly vermietungRepository: VermietungRepository,
  ) {}

  async getSummary(userId: string, steuerjahr: number): Promise<CockpitSummaryDto | null> {
    const record = await this.taxYearRepository.findByUserAndYear(userId, steuerjahr)
    if (!record) return null

    const [lstbRecord, interviewRows, kennzeichnungen, renteRecord, kapitalRecord, vermietungRecords] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
      this.kennzeichnungRepository.listForUserAndYears(userId, [steuerjahr]),
      this.renteRepository.findForUserAndYear(userId, steuerjahr),
      this.kapitalRepository.findForUserAndYear(userId, steuerjahr),
      this.vermietungRepository.listForUserAndYear(userId, steuerjahr),
    ])

    const daten = lstbDatenAus(lstbRecord)
    const answers = answersAus(interviewRows)

    const unbestaetigteFakten = new Set(
      kennzeichnungen.filter((k) => !k.bestaetigt).map((k) => k.key.slice(0, k.key.indexOf('.'))),
    )
    let unbestaetigte = 0
    let unbestaetigteSumme = 0
    for (const fakt of unbestaetigteFakten) {
      let wert: number | null = null
      if (fakt === 'lstb' && daten.bruttoarbeitslohn.kind === 'erfasst') {
        wert = daten.bruttoarbeitslohn.wert
      } else if (fakt === 'rente') {
        wert = erfassterWert(renteRecord?.jahresbetrag ?? null)
      } else if (fakt === 'kapital') {
        wert = erfassterWert(kapitalRecord?.kapitalertraege ?? null)
      } else if (fakt.startsWith('vermietung:')) {
        const objektId = fakt.slice('vermietung:'.length)
        const objekt = vermietungRecords.find((o) => o.id === objektId)
        wert = erfassterWert(objekt?.mieteinnahmen ?? null)
      }
      if (wert !== null) {
        unbestaetigte += 1
        unbestaetigteSumme += wert
      }
    }

    const fakten = angestellteAusDaten(daten, answers)
    const stand = cockpitSpanneAusEingaben({
      summe: fakten.einnahmen,
      offenePosten: fakten.offenePosten,
      konflikte: fakten.konflikte,
      gegated: fakten.gegated,
      unbestaetigte,
      unbestaetigteSumme,
    })

    return { taxYear: record.steuerjahr, stand: toStandDto(stand), openItems: record.openItems }
  }
}
