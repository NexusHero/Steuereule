import { RENTAL_FIELDS, type RentalFieldId } from '@steuereule/core'
import type { ScreenAccess } from '../common/screen-access.js'
import type { RentalRepository } from './rental.repository.js'

/** What describes a rental object beyond its amounts (Anlage V Zeilen 1–13, 20, 33, 46, 86); the mask's address call stores them. */
const RENTAL_DETAIL_FIELDS = ['strasse', 'hausnummer', 'plz', 'city', 'livingArea', 'einheiten', 'depreciationAsLastYear', 'umlagen', 'schuldzinsen', 'anteilA'] as const
type RentalDetailField = (typeof RENTAL_DETAIL_FIELDS)[number]
export const RENTAL_ACCESS_FIELDS = [...RENTAL_FIELDS, ...RENTAL_DETAIL_FIELDS] as const

/** The confirmation path's view of the screen `vermietung` (ADR-0066): the instance is the rental object's id. */
export function rentalFieldAccess(rental: RentalRepository): ScreenAccess {
  return {
    fields: RENTAL_ACCESS_FIELDS,
    withInstance: true,
    async read(userId, taxYear, instance) {
      const property = (await rental.listForUserAndYear(userId, taxYear)).find((o) => o.id === instance)
      if (property === undefined) return null
      const details = Object.fromEntries(
        RENTAL_DETAIL_FIELDS.map((f) => {
          const v = property[f]
          return [f, v === null || v === undefined ? null : String(v)]
        }),
      )
      return { ...Object.fromEntries(RENTAL_FIELDS.map((f) => [f, property[f]])), ...details }
    },
    async write(userId, taxYear, instance, field, value) {
      if (instance === null) return false
      if ((RENTAL_DETAIL_FIELDS as readonly string[]).includes(field)) {
        const detail = field as RentalDetailField
        const stored = detail === 'depreciationAsLastYear' ? (value === null ? null : value === 'true') : value
        return (await rental.setAddress(userId, taxYear, instance, { [detail]: stored })) !== null
      }
      return (await rental.setField(userId, taxYear, instance, field as RentalFieldId, value)) !== null
    },
  }
}
