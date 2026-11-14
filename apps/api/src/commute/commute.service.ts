import { Inject, Injectable } from '@nestjs/common'
import { calculateWorkdays, effectivePublicHolidays } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from './commute.repository.js'
import { allowanceOverWays } from './ways-to-work.js'

export interface CommuteStatus {
  readonly inputs: CommuteInputs | null
  readonly workdays: { readonly weekdays: number; readonly workdays: number; readonly commuteDays: number } | null
  readonly commuterAllowance: number | null
}

/** Stores the commute facts and derives Pendlertage and Entfernungspauschale from the core. */
@Injectable()
export class CommuteService {
  constructor(@Inject(COMMUTE_REPOSITORY) private readonly repository: CommuteRepository) {}

  async getState(userId: string, taxYear: number): Promise<CommuteStatus> {
    const inputs = await this.repository.findForUserAndYear(userId, taxYear)
    return inputs === null ? { inputs: null, workdays: null, commuterAllowance: null } : status(taxYear, inputs)
  }

  async save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteStatus> {
    const result = status(taxYear, inputs)
    await this.repository.save(userId, taxYear, inputs)
    return result
  }
}

function status(taxYear: number, inputs: CommuteInputs): CommuteStatus {
  const result = calculateWorkdays({
    year: taxYear,
    workdays: inputs.workdays,
    vacationDays: inputs.vacationDays,
    sickDays: inputs.sickDays,
    homeOfficeDays: inputs.homeOfficeDays,
    publicHolidays: effectivePublicHolidays(taxYear, inputs),
  })
  if (result.kind === 'widerspruch') {
    throw new InvalidInputError('ARBEITSTAGE_WIDERSPRUCH', `The days off exceed the working days (${result.conflict.kind}).`)
  }
  const { weekdays, workdays, commuteDays } = result
  const allowance = allowanceOverWays(taxYear, inputs, commuteDays)
  return { inputs, workdays: { weekdays, workdays, commuteDays }, commuterAllowance: allowance }
}
