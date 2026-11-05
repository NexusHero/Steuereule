export interface TaxYearRolloverRecord {
  id: string
  userId: string
  taxYear?: number
  steuerjahr: number
  vorjahr: number
  createdAt: Date
}

export const TAX_YEAR_ROLLOVER_REPOSITORY = Symbol('TAX_YEAR_ROLLOVER_REPOSITORY')

/** The persistence seam recording which tax year was taken over from which previous year. */
export interface TaxYearRolloverRepository {
  findForUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRolloverRecord | null>
  record(userId: string, steuerjahr: number, vorjahr: number): Promise<TaxYearRolloverRecord>
  deleteForUser(userId: string): Promise<number>
  listForUser(userId: string): Promise<TaxYearRolloverRecord[]>
}
