import {
  CAPITAL_FIELDS,
  WAGE_TAX_CERTIFICATE_FIELDS,
  PENSION_FIELDS,
  RENTAL_FIELDS,
  type CapitalFieldId,
  type WageTaxCertificateFieldId,
  type Maske,
  type PensionFieldId,
  type RentalFieldId,
} from '@steuereule/core'
import type { CapitalRepository } from '../kapital/kapital.repository.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import type { PensionRepository } from '../rente/rente.repository.js'
import type { RentalRepository } from '../vermietung/vermietung.repository.js'

export interface MaskenZugriff {
  readonly felder: readonly string[]
  readonly mitInstanz: boolean
  lese(userId: string, steuerjahr: number, instanz: string | null): Promise<Readonly<Record<string, string | null>> | null>
  schreibe(userId: string, steuerjahr: number, instanz: string | null, feld: string, wert: string | null): Promise<boolean>
}

export type FeldZugriff = Readonly<Partial<Record<Maske, MaskenZugriff>>>

export const FELD_ZUGRIFF = Symbol('FELD_ZUGRIFF')

export interface FeldZugriffRepositories {
  readonly lstb: WageTaxCertificateRepository
  readonly rente: PensionRepository
  readonly kapital: CapitalRepository
  readonly vermietung: RentalRepository
}

const RENTE_ZUGRIFF_FELDER = ['rentenart', ...PENSION_FIELDS] as const

export function feldZugriffAus({ lstb, rente, kapital, vermietung }: FeldZugriffRepositories): FeldZugriff {
  return {
    lstb: {
      felder: WAGE_TAX_CERTIFICATE_FIELDS,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await lstb.findForUserAndYear(userId, steuerjahr)
        return { bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null, lohnsteuer: r?.lohnsteuer ?? null, sozialversicherung: r?.sozialversicherung ?? null }
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        await lstb.setFeld(userId, steuerjahr, feld as WageTaxCertificateFieldId, wert)
        return true
      },
    },
    rente: {
      felder: RENTE_ZUGRIFF_FELDER,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await rente.findForUserAndYear(userId, steuerjahr)
        return {
          rentenart: r?.rentenart ?? null,
          jahresbetrag: r?.jahresbetrag ?? null,
          rentenbeginnJahr: r?.rentenbeginnJahr ?? null,
          alterBeiRentenbeginn: r?.alterBeiRentenbeginn ?? null,
        }
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        if (feld === 'rentenart') await rente.setRentenart(userId, steuerjahr, wert)
        else await rente.setFeld(userId, steuerjahr, feld as PensionFieldId, wert)
        return true
      },
    },
    kapital: {
      felder: CAPITAL_FIELDS,
      mitInstanz: false,
      async lese(userId, steuerjahr) {
        const r = await kapital.findForUserAndYear(userId, steuerjahr)
        return Object.fromEntries(CAPITAL_FIELDS.map((f) => [f, r?.[f] ?? null]))
      },
      async schreibe(userId, steuerjahr, _instanz, feld, wert) {
        await kapital.setFeld(userId, steuerjahr, feld as CapitalFieldId, wert)
        return true
      },
    },
    vermietung: {
      felder: RENTAL_FIELDS,
      mitInstanz: true,
      async lese(userId, steuerjahr, instanz) {
        const objekt = (await vermietung.listForUserAndYear(userId, steuerjahr)).find((o) => o.id === instanz)
        if (objekt === undefined) return null
        return Object.fromEntries(RENTAL_FIELDS.map((f) => [f, objekt[f]]))
      },
      async schreibe(userId, steuerjahr, instanz, feld, wert) {
        if (instanz === null) return false
        return (await vermietung.setFeld(userId, steuerjahr, instanz, feld as RentalFieldId, wert)) !== null
      },
    },
  }
}
