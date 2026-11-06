import type { IsoWeekday, IsoWochentag } from '@steuereule/core'

export type MeansOfTransport = 'pkw' | 'oepnv' | 'andere'
export type Verkehrsmittel = MeansOfTransport

export const MEANS_OF_TRANSPORT: readonly MeansOfTransport[] = ['pkw', 'oepnv', 'andere']
export const VERKEHRSMITTEL = MEANS_OF_TRANSPORT

export interface CommuteInputs {
  readonly arbeitstage: readonly (IsoWeekday | IsoWochentag)[]
  readonly urlaubstage: number
  readonly krankheitstage: number
  readonly homeofficeTage: number
  readonly einfacheKm: number | null
  readonly verkehrsmittel: MeansOfTransport | null
  readonly taetigkeitsstaette: string | null
  /** Confirmed public holidays on working days (F4); null = none counted. */
  readonly feiertage?: number | null
  /** The state or canton the suggestion came from (public-holidays.ts). */
  readonly feiertageRegion?: string | null
}
export type ArbeitswegEingaben = CommuteInputs

export const COMMUTE_REPOSITORY = Symbol('COMMUTE_REPOSITORY')
export const ARBEITSWEG_REPOSITORY = COMMUTE_REPOSITORY

/** The persistence seam for the commute facts behind the Entfernungspauschale. */
export interface CommuteRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<CommuteInputs | null>
  save(userId: string, steuerjahr: number, eingaben: CommuteInputs): Promise<CommuteInputs>
}
export type ArbeitswegRepository = CommuteRepository
