export interface TaxYearRolloverRecord {
  id: string
  userId: string
  taxYear: number
  lastYear: number
  createdAt: Date
}

export const TAX_YEAR_ROLLOVER_REPOSITORY = Symbol('TAX_YEAR_ROLLOVER_REPOSITORY')

/** The persistence seam recording which tax year was taken over from which previous year. */
export interface TaxYearRolloverRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<TaxYearRolloverRecord | null>
  record(userId: string, taxYear: number, lastYear: number): Promise<TaxYearRolloverRecord>
  deleteForUser(userId: string): Promise<number>
  listForUser(userId: string): Promise<TaxYearRolloverRecord[]>
}
