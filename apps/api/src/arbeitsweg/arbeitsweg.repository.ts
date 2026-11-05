import type { IsoWochentag } from '@steuereule/core'

export type Verkehrsmittel = 'pkw' | 'oepnv' | 'andere'

export const VERKEHRSMITTEL: readonly Verkehrsmittel[] = ['pkw', 'oepnv', 'andere']

export interface ArbeitswegEingaben {
  readonly arbeitstage: readonly IsoWochentag[]
  readonly urlaubstage: number
  readonly krankheitstage: number
  readonly homeofficeTage: number
  readonly einfacheKm: number | null
  readonly verkehrsmittel: Verkehrsmittel | null
  readonly taetigkeitsstaette: string | null
}

export const ARBEITSWEG_REPOSITORY = Symbol('ARBEITSWEG_REPOSITORY')

/** The persistence seam for the commute facts behind the Entfernungspauschale. */
export interface ArbeitswegRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<ArbeitswegEingaben | null>
  save(userId: string, steuerjahr: number, eingaben: ArbeitswegEingaben): Promise<ArbeitswegEingaben>
}
