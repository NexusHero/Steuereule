import { PENSION_FIELDS, type PensionFieldId } from '@steuereule/core'
import type { ScreenAccess } from '../common/screen-access.js'
import type { PensionRepository } from './pension.repository.js'

export const PENSION_ACCESS_FIELDS = ['rentenart', ...PENSION_FIELDS] as const

/** The confirmation path's view of the screen `rente` (ADR-0066). */
export function pensionFieldAccess(pension: PensionRepository): ScreenAccess {
  return {
    fields: PENSION_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await pension.findForUserAndYear(userId, taxYear)
      return {
        rentenart: r?.rentenart ?? null,
        jahresbetrag: r?.jahresbetrag ?? null,
        rentenbeginnJahr: r?.rentenbeginnJahr ?? null,
        alterBeiRentenbeginn: r?.alterBeiRentenbeginn ?? null,
      }
    },
    async write(userId, taxYear, _instance, field, value) {
      if (field === 'rentenart') await pension.setPensionKind(userId, taxYear, value)
      else await pension.setField(userId, taxYear, field as PensionFieldId, value)
      return true
    },
  }
}
