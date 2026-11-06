import { Inject, Injectable } from '@nestjs/common'
import { calculateWorkdays, commuterAllowance } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from './arbeitsweg.repository.js'

export interface CommuteStatus {
  readonly inputs: CommuteInputs | null
  readonly workdays: { readonly weekdays: number; readonly workdays: number; readonly commuteDays: number } | null
  readonly commuterAllowance: number | null
}

/** Stores the commute facts and derives Pendlertage and Entfernungspauschale from the core. */
@Injectable()
export class CommuteService {
  constructor(@Inject(COMMUTE_REPOSITORY) private readonly repository: CommuteRepository) {}

  async getState(userId: string, steuerjahr: number): Promise<CommuteStatus> {
    const inputs = await this.repository.findForUserAndYear(userId, steuerjahr)
    return inputs === null ? { inputs: null, workdays: null, commuterAllowance: null } : status(steuerjahr, inputs)
  }

  async save(userId: string, steuerjahr: number, inputs: CommuteInputs): Promise<CommuteStatus> {
    const result = status(steuerjahr, inputs)
    await this.repository.save(userId, steuerjahr, inputs)
    return result
  }
}

function status(steuerjahr: number, inputs: CommuteInputs): CommuteStatus {
  const result = calculateWorkdays({
    year: steuerjahr,
    workdays: inputs.arbeitstage,
    vacationDays: inputs.urlaubstage,
    sickDays: inputs.krankheitstage,
    homeOfficeDays: inputs.homeofficeTage,
    publicHolidays: inputs.feiertage ?? 0,
  })
  if (result.kind === 'widerspruch') {
    throw new InvalidInputError('ARBEITSTAGE_WIDERSPRUCH', `The days off exceed the working days (${result.conflict.art}).`)
  }
  const { weekdays, workdays, commuteDays } = result
  const allowance =
    inputs.einfacheKm === null || inputs.verkehrsmittel === null
      ? null
      : commuterAllowance({ oneWayKm: inputs.einfacheKm, days: commuteDays, year: steuerjahr, withCar: inputs.verkehrsmittel === 'pkw' })
  return { inputs, workdays: { weekdays, workdays, commuteDays }, commuterAllowance: allowance }
}
