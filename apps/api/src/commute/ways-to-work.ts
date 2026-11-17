import { commuterAllowanceByWay, weekdaysInPeriod, type WayToWork } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { CommuteInputs } from './commute.repository.js'

/**
 * The ways to work of a year (ADR-0079): the first one with its period, and a second one after a change of
 * job when its distance and means of transport are known. A way without distance or transport is no way.
 * Days the user stated for a way (ADR-0093) go with it and replace the derived ones.
 */
export function waysToWork(inputs: CommuteInputs): WayToWork[] {
  const ways: WayToWork[] = []
  if (inputs.oneWayKm !== null && inputs.transport !== null) {
    ways.push({ oneWayKm: inputs.oneWayKm, withCar: inputs.transport === 'pkw', from: inputs.periodFrom ?? null, to: inputs.periodTo ?? null, days: inputs.travelDays ?? null })
  }
  if (inputs.secondOneWayKm != null && inputs.secondTransport != null) {
    ways.push({ oneWayKm: inputs.secondOneWayKm, withCar: inputs.secondTransport === 'pkw', from: inputs.secondFrom ?? null, to: inputs.secondTo ?? null, days: inputs.secondTravelDays ?? null })
  }
  return ways
}

/** The Entfernungspauschale over all ways, or null without any way. */
export function allowanceOverWays(year: number, inputs: CommuteInputs, commuteDays: number): number | null {
  const ways = waysToWork(inputs)
  if (ways.length === 0) return null
  return commuterAllowanceByWay(year, inputs.workdays, commuteDays, ways).reduce((sum, w) => sum + w.allowance, 0)
}

/** The days travelled over all ways: the stated ones where given, the derived share otherwise; null without any way. */
export function travelDaysOverWays(year: number, inputs: CommuteInputs, commuteDays: number): number | null {
  const ways = waysToWork(inputs)
  if (ways.length === 0) return null
  return commuterAllowanceByWay(year, inputs.workdays, commuteDays, ways).reduce((sum, w) => sum + w.days, 0)
}

/**
 * Stated travel days cannot exceed the working weekdays of the way's period.
 * Every write path (mask, owl draft) runs this before it stores.
 */
export function assertTravelDaysFit(year: number, inputs: CommuteInputs): void {
  if (inputs.workdays.length === 0) return
  const check = (days: number | null | undefined, from: string | null | undefined, to: string | null | undefined, field: string): void => {
    if (days === null || days === undefined) return
    const possible = weekdaysInPeriod(year, inputs.workdays, from ?? null, to ?? null)
    if (days > possible) {
      throw new InvalidInputError('FAHRTAGE_WIDERSPRUCH', `"${field}" (${days}) exceeds the working days of the period (${possible}).`)
    }
  }
  check(inputs.travelDays, inputs.periodFrom, inputs.periodTo, 'travelDays')
  check(inputs.secondTravelDays, inputs.secondFrom, inputs.secondTo, 'secondTravelDays')
}
