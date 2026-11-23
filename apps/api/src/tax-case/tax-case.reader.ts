import type { CapitalRecord } from '../capital/capital.repository.js'
import type { CrossBorderSalaryStatementRecord } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import type { ChildRecord } from '../children/child.repository.js'
import type { CommuteInputs } from '../commute/commute.repository.js'
import type { InterviewAnswerRecord } from '../interview/interview-answer.repository.js'
import type { PartnerCouplingRecord } from '../link/link.repository.js'
import type { WageTaxCertificateRecord } from '../lstb/lstb.repository.js'
import type { MasterDataRecord } from '../master-data/master-data.repository.js'
import type { PensionRecord } from '../pension/pension.repository.js'
import type { ProfileRecord } from '../profile/profile.repository.js'
import type { RentalObjectRecord } from '../rental/rental.repository.js'

/**
 * Everything one person has entered for one tax year, record by record, as the repositories store it.
 * The services that compute on a return (estimate, printout, Cockpit, Abgabe, Verlauf, Bescheid,
 * Veranlagungsvergleich) read it here instead of each holding the same repositories.
 */
export interface TaxCaseRecords {
  /** Lohnsteuerbescheinigung. */
  readonly wageTaxCertificate: WageTaxCertificateRecord | null
  /** Swiss Lohnausweis and its letters (Grenzgänger). */
  readonly salaryStatement: CrossBorderSalaryStatementRecord | null
  /** Ways to work, home office and further work expenses. */
  readonly commute: CommuteInputs | null
  /** The interview answers of the year, one row per step. */
  readonly interviewRows: InterviewAnswerRecord[]
  /** Not per year: the person's Stammdaten. */
  readonly masterData: MasterDataRecord | null
  /** Not per year: the person's profile (name, tax id). */
  readonly profile: ProfileRecord | null
  readonly pension: PensionRecord | null
  readonly capital: CapitalRecord | null
  readonly rentals: RentalObjectRecord[]
  readonly children: ChildRecord[]
  /** The Kopplung of the year: filing type and spouse. */
  readonly coupling: PartnerCouplingRecord | null
}

export type TaxCasePart = keyof TaxCaseRecords

export const TAX_CASE_READER = Symbol('TAX_CASE_READER')

/**
 * Reads the parts of a tax case a caller names, in parallel, and only those: a caller pays for the
 * queries it needs. A part whose repository is not bound reads as empty (null, or no rows).
 */
export interface TaxCaseReader {
  read<P extends TaxCasePart>(userId: string, taxYear: number, parts: readonly P[]): Promise<Pick<TaxCaseRecords, P>>
}
