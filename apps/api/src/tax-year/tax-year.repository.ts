export interface TaxYearRecord {
  taxYear: number
  openItems: number
}

export const TAX_YEAR_REPOSITORY = Symbol('TAX_YEAR_REPOSITORY')

/** The persistence seam for the Cockpit's raw tax-year inputs. */
export interface TaxYearRepository {
  findByUserAndYear(userId: string, taxYear: number): Promise<TaxYearRecord | null>
}
