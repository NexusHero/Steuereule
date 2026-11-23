import { LSTB_OPTIONAL_LINES, LSTB_SOCIAL_LINES, LSTB_SOLI_LINE, WAGE_TAX_CERTIFICATE_FIELDS, type WageTaxCertificateFieldId } from '@steuereule/core'
import type { ScreenAccess } from '../common/screen-access.js'
import { storeLstbLines } from './lstb-data.js'
import type { LstbLine, WageTaxCertificateRepository } from './lstb.repository.js'

/** Zeilen 22–27, 24c and 5 of the LStB (ADR-0093). */
const LSTB_LINE_FIELDS: readonly string[] = [...LSTB_SOCIAL_LINES, LSTB_SOLI_LINE]
export const LSTB_ACCESS_FIELDS = [...WAGE_TAX_CERTIFICATE_FIELDS, ...LSTB_OPTIONAL_LINES, ...LSTB_LINE_FIELDS] as const

/** The confirmation path's view of the screen `lstb` (ADR-0066). */
export function lstbFieldAccess(lstb: WageTaxCertificateRepository): ScreenAccess {
  return {
    fields: LSTB_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await lstb.findForUserAndYear(userId, taxYear)
      return {
        bruttoarbeitslohn: r?.bruttoarbeitslohn ?? null,
        lohnsteuer: r?.lohnsteuer ?? null,
        sozialversicherung: r?.sozialversicherung ?? null,
        kirchensteuer: r?.kirchensteuer ?? null,
        kirchensteuerEhegatte: r?.kirchensteuerEhegatte ?? null,
        zuschuesseKvPv: r?.zuschuesseKvPv ?? null,
        ...Object.fromEntries(LSTB_LINE_FIELDS.map((line) => [line, r?.[line as LstbLine] ?? null])),
      }
    },
    async write(userId, taxYear, _instance, field, value) {
      if (LSTB_LINE_FIELDS.includes(field)) {
        // The same write as the mask's: the sum of Zeilen 23, 25, 26 and 27 follows the lines (ADR-0093).
        await storeLstbLines(lstb, userId, taxYear, { [field as LstbLine]: value })
      } else if (field === 'zuschuesseKvPv') {
        await lstb.setSubsidies(userId, taxYear, value)
      } else if (field === 'kirchensteuer' || field === 'kirchensteuerEhegatte') {
        const r = await lstb.findForUserAndYear(userId, taxYear)
        const lines = { kirchensteuer: r?.kirchensteuer ?? null, kirchensteuerEhegatte: r?.kirchensteuerEhegatte ?? null }
        await lstb.setChurchTax(userId, taxYear, { ...lines, [field]: value })
      } else {
        await lstb.setField(userId, taxYear, field as WageTaxCertificateFieldId, value)
      }
      return true
    },
  }
}
