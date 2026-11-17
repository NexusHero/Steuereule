import {
  EMPTY_WAGE_TAX_CERTIFICATE,
  LSTB_SOCIAL_LINES,
  deserializeWageTaxCertificateField,
  lstbSocialSecurityFromLines,
  lstbSubsidyQuestionOpen,
  type LstbLineValues,
  type WageTaxCertificateData,
} from '@steuereule/core'
import type { LstbLinePatch, WageTaxCertificateRecord, WageTaxCertificateRepository } from './lstb.repository.js'

const wholeEuros = (value: string | null | undefined): number | null => (value !== null && value !== undefined && /^\d+$/.test(value) ? Number(value) : null)

/** Zeilen 22–27, 24c and 24 as numbers; anything unreadable counts as not entered. */
export function lstbLineValuesFrom(record: WageTaxCertificateRecord | null): LstbLineValues {
  return {
    ...Object.fromEntries(LSTB_SOCIAL_LINES.map((line) => [line, wholeEuros(record?.[line])])),
    zuschuesseKvPv: wholeEuros(record?.zuschuesseKvPv),
  }
}

export function wageTaxCertificateDataFrom(record: WageTaxCertificateRecord | null): WageTaxCertificateData {
  if (record === null) return EMPTY_WAGE_TAX_CERTIFICATE ?? EMPTY_WAGE_TAX_CERTIFICATE
  return {
    bruttoarbeitslohn: deserializeWageTaxCertificateField(record.bruttoarbeitslohn),
    lohnsteuer: deserializeWageTaxCertificateField(record.lohnsteuer),
    // Zeile 25 or 26 filled without an answer to Zeile 24: the social security is not complete yet,
    // whatever sum is stored (ADR-0093). The mask, the estimate and the owl's checklist all read this.
    sozialversicherung: lstbSubsidyQuestionOpen(lstbLineValuesFrom(record)) ? { kind: 'offen' } : deserializeWageTaxCertificateField(record.sozialversicherung),
  }
}

/**
 * Writes LStB lines and keeps the sum with them: once Zeilen 23, 25, 26 and 27 are all recorded,
 * `sozialversicherung` is their sum (ADR-0093). The one write path of the mask and of the owl's drafts,
 * so nobody adds the lines by hand.
 */
export async function storeLstbLines(repository: WageTaxCertificateRepository, userId: string, taxYear: number, patch: LstbLinePatch): Promise<WageTaxCertificateRecord> {
  const current = await repository.findForUserAndYear(userId, taxYear)
  const merged = lstbLineValuesFrom({ userId, taxYear, bruttoarbeitslohn: null, lohnsteuer: null, sozialversicherung: null, ...current, ...patch })
  const sum = lstbSocialSecurityFromLines(merged)
  return repository.setLines(userId, taxYear, { ...patch, ...(sum !== null ? { sozialversicherung: String(sum) } : {}) })
}
