import { Inject, Injectable } from '@nestjs/common'
import { berechneWerktage, pendlerpauschale } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import { ARBEITSWEG_REPOSITORY, type ArbeitswegEingaben, type ArbeitswegRepository } from './arbeitsweg.repository.js'

export interface ArbeitswegStand {
  readonly eingaben: ArbeitswegEingaben | null
  readonly werktage: { readonly wochentage: number; readonly werktage: number; readonly pendlertage: number } | null
  readonly pendlerpauschale: number | null
}

/** Stores the commute facts and derives Pendlertage and Entfernungspauschale from the core. */
@Injectable()
export class ArbeitswegService {
  constructor(@Inject(ARBEITSWEG_REPOSITORY) private readonly repository: ArbeitswegRepository) {}

  async getState(userId: string, steuerjahr: number): Promise<ArbeitswegStand> {
    const eingaben = await this.repository.findForUserAndYear(userId, steuerjahr)
    return eingaben === null ? { eingaben: null, werktage: null, pendlerpauschale: null } : stand(steuerjahr, eingaben)
  }

  async save(userId: string, steuerjahr: number, eingaben: ArbeitswegEingaben): Promise<ArbeitswegStand> {
    const ergebnis = stand(steuerjahr, eingaben)
    await this.repository.save(userId, steuerjahr, eingaben)
    return ergebnis
  }
}

function stand(steuerjahr: number, eingaben: ArbeitswegEingaben): ArbeitswegStand {
  const ergebnis = berechneWerktage({
    jahr: steuerjahr,
    werktage: eingaben.arbeitstage,
    urlaubstage: eingaben.urlaubstage,
    krankheitstage: eingaben.krankheitstage,
    homeofficeTage: eingaben.homeofficeTage,
  })
  if (ergebnis.kind === 'widerspruch') {
    throw new InvalidInputError('ARBEITSTAGE_WIDERSPRUCH', `The days off exceed the working days (${ergebnis.widerspruch.art}).`)
  }
  const { wochentage, werktage, pendlertage } = ergebnis
  const pauschale =
    eingaben.einfacheKm === null || eingaben.verkehrsmittel === null
      ? null
      : pendlerpauschale({ einfacheKm: eingaben.einfacheKm, tage: pendlertage, jahr: steuerjahr, mitPkw: eingaben.verkehrsmittel === 'pkw' })
  return { eingaben, werktage: { wochentage, werktage, pendlertage }, pendlerpauschale: pauschale }
}
