import { Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  LATE_FILING_FEE_MINIMUM_EUR,
  LATE_FILING_FEE_PERCENT_PER_MONTH,
  deadlineWarning,
  getTaxYearParameters,
  isSupportedIncomeTaxYear,
} from '@steuereule/core'
import type { DeadlinesResponseDto } from './dto/deadlines-response.dto.js'

export function todayInBerlin(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  const year = get('year')
  const month = get('month')
  const tag = get('day')
  if (year === undefined || month === undefined || tag === undefined) {
    throw new Error('heuteInBerlin: the Berlin date parts are incomplete')
  }
  return `${year}-${month}-${tag}`
}

/** Application logic for the Fristen-/Verspätungszuschlag-Warnmodus. */
@Injectable()
export class DeadlinesService {
  async getDeadlines(taxYear: number): Promise<DeadlinesResponseDto> {
    const today = todayInBerlin()
    let warning
    try {
      warning = deadlineWarning(taxYear, today)
    } catch (error) {
      if (error instanceof RangeError) {
        throw new InvalidInputError('STEUERJAHR_UNSUPPORTED', error.message)
      }
      throw error
    }

    return {
      filingDeadline: warning.filingDeadline,
      today,
      level: warning.level,
      remainingDays: warning.remainingDays,
      lateFilingSurcharge: isSupportedIncomeTaxYear(taxYear)
        ? {
            minimumRateEur: getTaxYearParameters(taxYear).deadlines.lateFilingMinEur,
            percentPerMonth: getTaxYearParameters(taxYear).deadlines.lateFilingPercentPerMonth,
          }
        : { minimumRateEur: LATE_FILING_FEE_MINIMUM_EUR, percentPerMonth: LATE_FILING_FEE_PERCENT_PER_MONTH },
    }
  }
}
