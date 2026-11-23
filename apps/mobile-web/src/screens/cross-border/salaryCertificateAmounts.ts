import { SALARY_CERTIFICATE_SIGNED_FIELD, isValidSalaryCertificateAmount } from '@steuereule/core'
import type { ChSalaryCertificateResponseDto } from '@steuereule/api-client'
import { signedWholeAmountFrom } from '../shared/wholeEuros'

/** Ziffern 1–7 of the Swiss Lohnausweis sum up to Ziffer 8 (Bruttolohn total / AHV). */
export const GROSS_COMPONENT_IDS = [
  'lohn',
  'gehaltsnebenleistungen',
  'unregelmaessige-leistungen',
  'kapitalleistungen',
  'beteiligungsrechte',
  'sitzungsgelder',
  'andere-leistungen',
] as const

/** Whole CHF of one Lohnausweis Ziffer; only Ziffer 7 may be negative (ADR-0093). Empty or unreadable is null. */
export function salaryAmountFrom(text: string, fieldId: string): number | null {
  const value = signedWholeAmountFrom(text)
  if (value === null) return null
  return isValidSalaryCertificateAmount(value, fieldId === SALARY_CERTIFICATE_SIGNED_FIELD ? SALARY_CERTIFICATE_SIGNED_FIELD : undefined) ? value : null
}

/** The sum of the drafted Ziffern 1–7, skipping empty, unreadable and zero ones. */
export function grossComponentSum(drafts: Readonly<Record<string, string>>): number {
  const grossComponentValues = GROSS_COMPONENT_IDS.map((id) => salaryAmountFrom(drafts[id] ?? '', id)).filter(
    (v): v is number => v !== null && v !== 0,
  )
  return grossComponentValues.reduce((acc, n) => acc + n, 0)
}

/** Ziffern 2–7: an edit to one of them updates the Ziffer 8 sum unless it was typed by hand. */
export function isAdditionalGrossComponent(fieldId: string): boolean {
  return fieldId !== 'lohn' && (GROSS_COMPONENT_IDS as readonly string[]).includes(fieldId)
}

/** A Ziffer as text for its input; empty while it is open. */
export function valueFromResponse(salaryCertificate: ChSalaryCertificateResponseDto, id: string): string {
  const field = salaryCertificate.fields.find((x) => x.id === id)
  return field?.kind === 'erfasst' && field.value !== undefined ? String(field.value) : ''
}

/** A Ziffer of the Lohnausweis as recorded, or null while it is open. */
export function wageFieldValue(salaryCertificate: ChSalaryCertificateResponseDto, id: string): number | null {
  const field = salaryCertificate.fields.find((f) => f.id === id)
  return field?.kind === 'erfasst' && field.value !== undefined ? field.value : null
}
