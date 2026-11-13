import type { SalaryCertificateAmountFieldId } from '@steuereule/core'

export type ChSalaryCertificateFields = Record<SalaryCertificateAmountFieldId, string | null>

/** The Anlage-N-Gre facts beyond the Lohnausweis. */
export interface NGreDetails {
  arbeitgeberName: string | null
  arbeitgeberStrasse: string | null
  arbeitgeberPlzOrt: string | null
  familienzulagenChf: string | null
  krankentaggeldChf: string | null
  pkArbeitnehmerChf: string | null
  pkArbeitgeberChf: string | null
  pkArbeitgeberGesamtChf: string | null
  steuerfreiesKrankentaggeldChf: string | null
  krankentaggeldArbeitgeberProzent: string | null
  krankentaggeldArbeitgeberChf: string | null
  nbuvArbeitgeberProzent: string | null
  nbuvArbeitgeberChf: string | null
  nGreSonderfaelle: boolean | null
}

export const EMPTY_N_GRE: NGreDetails = {
  arbeitgeberName: null,
  arbeitgeberStrasse: null,
  arbeitgeberPlzOrt: null,
  familienzulagenChf: null,
  krankentaggeldChf: null,
  pkArbeitnehmerChf: null,
  pkArbeitgeberChf: null,
  pkArbeitgeberGesamtChf: null,
  steuerfreiesKrankentaggeldChf: null,
  krankentaggeldArbeitgeberProzent: null,
  krankentaggeldArbeitgeberChf: null,
  nbuvArbeitgeberProzent: null,
  nbuvArbeitgeberChf: null,
  nGreSonderfaelle: null,
}

export interface CrossBorderSalaryStatementRecord {
  userId: string
  taxYear: number
  fields: ChSalaryCertificateFields
  bemerkungen: string | null
  saeule3aChf: string | null
  krankenkasseChf: string | null
  exchangeRateMonth: string | null
  exchangeRateValue: number | null
  exchangeRateMode: string | null
  exchangeRateReceiptId: string | null
  nGre: NGreDetails
}

export const CROSS_BORDER_SALARY_STATEMENT_REPOSITORY = Symbol('CH_LOHNAUSWEIS_REPOSITORY')

/** The persistence seam for the CH-Lohnausweis guided mask. */
export interface CrossBorderSalaryStatementRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<CrossBorderSalaryStatementRecord | null>
  setField(userId: string, taxYear: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord>
  setRemarks(userId: string, taxYear: number, text: string | null): Promise<CrossBorderSalaryStatementRecord>
  setProvision(userId: string, taxYear: number, saeule3aChf: string | null, krankenkasseChf: string | null): Promise<CrossBorderSalaryStatementRecord>
  setNGre(userId: string, taxYear: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord>
  setExchangeRate(
    userId: string,
    taxYear: number,
    exchangeRate: { month: string; rate: number; mode: string; receiptId?: string },
  ): Promise<CrossBorderSalaryStatementRecord>
}
