import { Inject, Injectable, Optional } from '@nestjs/common'
import { calculateWorkdays, effectivePublicHolidays } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { AuditService } from '../audit/audit.service.js'
import { appendReadAudit } from '../common/read-audit.js'
import { assertWorkplaceFitsFormLine } from './commute-field-values.js'
import { COMMUTE_REPOSITORY, type CommuteInputs, type CommuteRepository } from './commute.repository.js'
import { allowanceOverWays, assertTravelDaysFit, travelDaysOverWays } from './ways-to-work.js'

export interface CommuteStatus {
  readonly inputs: CommuteInputs | null
  readonly workdays: { readonly weekdays: number; readonly workdays: number; readonly commuteDays: number } | null
  readonly commuterAllowance: number | null
}

/** Stores the commute facts and derives Pendlertage and Entfernungspauschale from the core. */
@Injectable()
export class CommuteService {
  constructor(
    @Inject(COMMUTE_REPOSITORY) private readonly repository: CommuteRepository,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {}

  /** `readBy` is who asked: Person A reading a Person B kept in A's account (ADR-0054) gets the audit row. */
  async getState(userId: string, taxYear: number, readBy: string = userId): Promise<CommuteStatus> {
    const inputs = await this.repository.findForUserAndYear(userId, taxYear)
    if (inputs !== null) await appendReadAudit(this.audit, readBy, 'arbeitsweg', [userId])
    return inputs === null ? { inputs: null, workdays: null, commuterAllowance: null } : status(taxYear, inputs)
  }

  async save(userId: string, taxYear: number, inputs: CommuteInputs): Promise<CommuteStatus> {
    // Both ways to work print into one-line boxes; refuse a text they cannot hold before it is stored.
    assertWorkplaceFitsFormLine(inputs.workplace)
    assertWorkplaceFitsFormLine(inputs.secondWorkplace)
    // What a save leaves out stays as stored, so the check and the answer look at the whole record.
    const current = await this.repository.findForUserAndYear(userId, taxYear)
    const sent = Object.fromEntries(Object.entries(inputs).filter(([, value]) => value !== undefined))
    const result = status(taxYear, { ...current, ...sent } as CommuteInputs)
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
  assertTravelDaysFit(taxYear, inputs)
  const { weekdays, workdays } = result
  const allowance = allowanceOverWays(taxYear, inputs, result.commuteDays)
  // Stated travel days stand in for the derived ones wherever the days are shown (ADR-0093).
  const commuteDays = travelDaysOverWays(taxYear, inputs, result.commuteDays) ?? result.commuteDays
  return { inputs, workdays: { weekdays, workdays, commuteDays }, commuterAllowance: allowance }
}
