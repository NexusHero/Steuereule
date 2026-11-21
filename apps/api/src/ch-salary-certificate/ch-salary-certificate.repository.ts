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
  /** Daily benefit of the accident insurance (UVG/SUVA) contained in Ziffer 8; raises the tax rate (§ 32b EStG). */
  steuerfreiesUnfalltaggeldChf: string | null
  krankentaggeldArbeitgeberProzent: string | null
  krankentaggeldArbeitgeberChf: string | null
  nbuvArbeitgeberProzent: string | null
  nbuvArbeitgeberChf: string | null
  nGreSonderfaelle: boolean | null
  /** Supplementary health insurance (VVG), whole CHF: other provision, not basic cover (ADR-0093). */
  krankenkasseZusatzChf: string | null
  /** Anlage Vorsorgeaufwand Zeile 49: entitled to tax-free subsidies to health insurance. */
  kvZuschussAnspruch: boolean | null
  /** The family allowance is contained in the gross wage of Ziffer 8; null = recorded before the question existed. */
  familienzulagenImBruttolohn: boolean | null
}

/** The yes/no facts among the N-Gre details. */
export const N_GRE_BOOLEAN_FIELDS = ['nGreSonderfaelle', 'kvZuschussAnspruch', 'familienzulagenImBruttolohn'] as const

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
  steuerfreiesUnfalltaggeldChf: null,
  krankentaggeldArbeitgeberProzent: null,
  krankentaggeldArbeitgeberChf: null,
  nbuvArbeitgeberProzent: null,
  nbuvArbeitgeberChf: null,
  nGreSonderfaelle: null,
  krankenkasseZusatzChf: null,
  kvZuschussAnspruch: null,
  familienzulagenImBruttolohn: null,
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
/** A partial save of the provision outside the wage: a key that is absent keeps its stored value, `null` clears it. */
export type ProvisionUpdate = { readonly saeule3aChf?: string | null; readonly krankenkasseChf?: string | null }

export interface CrossBorderSalaryStatementRepository {
  findForUserAndYear(userId: string, taxYear: number): Promise<CrossBorderSalaryStatementRecord | null>
  setField(userId: string, taxYear: number, field: SalaryCertificateAmountFieldId, value: string | null): Promise<CrossBorderSalaryStatementRecord>
  setRemarks(userId: string, taxYear: number, text: string | null): Promise<CrossBorderSalaryStatementRecord>
  /** Every certificate of these users, in all years, the latest first (for the employers they recorded). */
  listForUsers(userIds: readonly string[]): Promise<readonly CrossBorderSalaryStatementRecord[]>
  /** Writes only the columns the update carries (a missing key stays as stored), in one statement without reading first. */
  setProvision(userId: string, taxYear: number, provision: ProvisionUpdate): Promise<CrossBorderSalaryStatementRecord>
  setNGre(userId: string, taxYear: number, details: Partial<NGreDetails>): Promise<CrossBorderSalaryStatementRecord>
  setExchangeRate(
    userId: string,
    taxYear: number,
    exchangeRate: { month: string | null; rate: number | null; mode: string | null; receiptId?: string },
  ): Promise<CrossBorderSalaryStatementRecord>
}
