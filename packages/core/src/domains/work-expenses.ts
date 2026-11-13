/**
 * Werbungskosten beyond the commute and the home office (ADR-0076), per person: professional bodies
 * (Kz 310), work tools and typical work clothing (Kz 320), account fees and other expenses (Kz 380).
 * Whole euros as the user paid them; the estimate adds them to the commute and home-office allowances
 * and compares the total with the Arbeitnehmer-Pauschbetrag as before.
 */
export interface WorkExpenseAmounts {
  readonly professionalBodiesEur?: number | null | undefined
  readonly workEquipmentEur?: number | null | undefined
  readonly accountFeesEur?: number | null | undefined
  readonly otherWorkExpensesEur?: number | null | undefined
}

/** The tax offices accept 16 € account fees a year without proof. */
export const ACCOUNT_FEES_FLAT_RATE_EUR = 16

/** Kz 380: account fees and other further Werbungskosten together. */
export function furtherWorkExpensesKz380(x: WorkExpenseAmounts | null | undefined): number {
  return (x?.accountFeesEur ?? 0) + (x?.otherWorkExpensesEur ?? 0)
}

/** All further Werbungskosten of a person in whole euros (Kz 310 + 320 + 380). */
export function furtherWorkExpensesEur(x: WorkExpenseAmounts | null | undefined): number {
  if (!x) return 0
  return (x.professionalBodiesEur ?? 0) + (x.workEquipmentEur ?? 0) + furtherWorkExpensesKz380(x)
}
