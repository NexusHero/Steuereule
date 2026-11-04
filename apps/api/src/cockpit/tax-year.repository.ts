export interface TaxYearRecord {
  steuerjahr: number
  openItems: number
}

export const TAX_YEAR_REPOSITORY = Symbol('TAX_YEAR_REPOSITORY')

/** The persistence seam for the Cockpit's raw tax-year inputs. */
export interface TaxYearRepository {
  findByUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRecord | null>
}
