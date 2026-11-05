import { Inject, Injectable } from '@nestjs/common'
import { calculateWorkdays, commuterAllowance } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from './arbeitsweg.repository.js'

export interface ArbeitswegStand {
  readonly eingaben: CommuteInputs | null
  readonly werktage: { readonly wochentage: number; readonly werktage: number; readonly pendlertage: number } | null
  readonly pendlerpauschale: number | null
}

/** Stores the commute facts and derives Pendlertage and Entfernungspauschale from the core. */
@Injectable()
export class ArbeitswegService {
  constructor(@Inject(COMMUTE_REPOSITORY) private readonly repository: CommuteRepository) {}

  async getState(userId: string, steuerjahr: number): Promise<ArbeitswegStand> {
    const eingaben = await this.repository.findForUserAndYear(userId, steuerjahr)
    return eingaben === null ? { eingaben: null, werktage: null, pendlerpauschale: null } : stand(steuerjahr, eingaben)
  }

  async save(userId: string, steuerjahr: number, eingaben: CommuteInputs): Promise<ArbeitswegStand> {
    const ergebnis = stand(steuerjahr, eingaben)
    await this.repository.save(userId, steuerjahr, eingaben)
    return ergebnis
  }
}

function stand(steuerjahr: number, eingaben: CommuteInputs): ArbeitswegStand {
  const ergebnis = calculateWorkdays({
    year: steuerjahr,
    workdays: eingaben.arbeitstage,
    vacationDays: eingaben.urlaubstage,
    sickDays: eingaben.krankheitstage,
    homeOfficeDays: eingaben.homeofficeTage,
    publicHolidays: eingaben.feiertage ?? 0,
  })
  if (ergebnis.kind === 'widerspruch') {
    throw new InvalidInputError('ARBEITSTAGE_WIDERSPRUCH', `The days off exceed the working days (${ergebnis.widerspruch.art}).`)
  }
  const { wochentage, werktage, pendlertage } = ergebnis
  const pauschale =
    eingaben.einfacheKm === null || eingaben.verkehrsmittel === null
      ? null
      : commuterAllowance({ oneWayKm: eingaben.einfacheKm, days: pendlertage, year: steuerjahr, withCar: eingaben.verkehrsmittel === 'pkw' })
  return { eingaben, werktage: { wochentage, werktage, pendlertage }, pendlerpauschale: pauschale }
}
