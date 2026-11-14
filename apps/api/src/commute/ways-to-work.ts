import { commuterAllowanceByWay, type WayToWork } from '@steuereule/core'
import type { CommuteInputs } from './commute.repository.js'

/**
 * The ways to work of a year (ADR-0079): the first one with its period, and a second one after a change of
 * job when its distance and means of transport are known. A way without distance or transport is no way.
 */
export function waysToWork(inputs: CommuteInputs): WayToWork[] {
  const ways: WayToWork[] = []
  if (inputs.oneWayKm !== null && inputs.transport !== null) {
    ways.push({ oneWayKm: inputs.oneWayKm, withCar: inputs.transport === 'pkw', from: inputs.periodFrom ?? null, to: inputs.periodTo ?? null })
  }
  if (inputs.secondOneWayKm != null && inputs.secondTransport != null) {
    ways.push({ oneWayKm: inputs.secondOneWayKm, withCar: inputs.secondTransport === 'pkw', from: inputs.secondFrom ?? null, to: inputs.secondTo ?? null })
  }
  return ways
}

/** The Entfernungspauschale over all ways, or null without any way. */
export function allowanceOverWays(year: number, inputs: CommuteInputs, commuteDays: number): number | null {
  const ways = waysToWork(inputs)
  if (ways.length === 0) return null
  return commuterAllowanceByWay(year, inputs.workdays, commuteDays, ways).reduce((sum, w) => sum + w.allowance, 0)
}
