import {
  CAPITAL_FIELDS,
  WAGE_TAX_CERTIFICATE_FIELDS,
  PENSION_FIELDS,
  RENTAL_FIELDS,
  type CapitalFieldId,
  type WageTaxCertificateFieldId,
  type Screen,
  type PensionFieldId,
  type RentalFieldId,
} from '@steuereule/core'
import type { CapitalRepository } from '../kapital/kapital.repository.js'
import type { WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import type { PensionRepository } from '../rente/rente.repository.js'
import type { RentalRepository } from '../vermietung/vermietung.repository.js'

export interface ScreenAccess {
  readonly fields: readonly string[]
  readonly withInstance: boolean
  read(userId: string, steuerjahr: number, instance: string | null): Promise<Readonly<Record<string, string | null>> | null>
  write(userId: string, steuerjahr: number, instance: string | null, field: string, value: string | null): Promise<boolean>
}

export type FieldAccess = Readonly<Partial<Record<Screen, ScreenAccess>>>

export const FIELD_ACCESS = Symbol('FELD_ZUGRIFF')

export interface FieldAccessRepositories {
  readonly lstb: WageTaxCertificateRepository
  readonly pension: PensionRepository
  readonly capital: CapitalRepository
  readonly rental: RentalRepository
}

const PENSION_ACCESS_FIELDS = ['rentenart', ...PENSION_FIELDS] as const

export function fieldAccessFrom({ lstb, pension, capital, rental }: FieldAccessRepositories): FieldAccess {
  return {
    lstb: {
      fields: WAGE_TAX_CERTIFICATE_FIELDS,
      withInstance: false,
      async read(userId, steuerjahr) {
        const r = await lstb.findForUserAndYear(userId, steuerjahr)
        return { bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null, lohnsteuer: r?.lohnsteuer ?? null, sozialversicherung: r?.sozialversicherung ?? null }
      },
      async write(userId, steuerjahr, _instance, field, value) {
        await lstb.setField(userId, steuerjahr, field as WageTaxCertificateFieldId, value)
        return true
      },
    },
    rente: {
      fields: PENSION_ACCESS_FIELDS,
      withInstance: false,
      async read(userId, steuerjahr) {
        const r = await pension.findForUserAndYear(userId, steuerjahr)
        return {
          rentenart: r?.rentenart ?? null,
          jahresbetrag: r?.jahresbetrag ?? null,
          rentenbeginnJahr: r?.rentenbeginnJahr ?? null,
          alterBeiRentenbeginn: r?.alterBeiRentenbeginn ?? null,
        }
      },
      async write(userId, steuerjahr, _instance, field, value) {
        if (field === 'rentenart') await pension.setPensionKind(userId, steuerjahr, value)
        else await pension.setField(userId, steuerjahr, field as PensionFieldId, value)
        return true
      },
    },
    kapital: {
      fields: CAPITAL_FIELDS,
      withInstance: false,
      async read(userId, steuerjahr) {
        const r = await capital.findForUserAndYear(userId, steuerjahr)
        return Object.fromEntries(CAPITAL_FIELDS.map((f) => [f, r?.[f] ?? null]))
      },
      async write(userId, steuerjahr, _instance, field, value) {
        await capital.setField(userId, steuerjahr, field as CapitalFieldId, value)
        return true
      },
    },
    vermietung: {
      fields: RENTAL_FIELDS,
      withInstance: true,
      async read(userId, steuerjahr, instance) {
        const property = (await rental.listForUserAndYear(userId, steuerjahr)).find((o) => o.id === instance)
        if (property === undefined) return null
        return Object.fromEntries(RENTAL_FIELDS.map((f) => [f, property[f]]))
      },
      async write(userId, steuerjahr, instance, field, value) {
        if (instance === null) return false
        return (await rental.setField(userId, steuerjahr, instance, field as RentalFieldId, value)) !== null
      },
    },
  }
}
