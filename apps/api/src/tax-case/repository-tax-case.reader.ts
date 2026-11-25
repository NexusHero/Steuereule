import { Inject, Injectable } from '@nestjs/common'
import { CAPITAL_REPOSITORY, type CapitalRepository } from '../capital/capital.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { CHILD_REPOSITORY, type ChildRepository } from '../children/child.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { couplingForDataAccess, PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { MASTER_DATA_REPOSITORY, type MasterDataRepository } from '../master-data/master-data.repository.js'
import { PENSION_REPOSITORY, type PensionRepository } from '../pension/pension.repository.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { RENTAL_REPOSITORY, type RentalRepository } from '../rental/rental.repository.js'
import type { TaxCasePart, TaxCaseReader, TaxCaseRecords } from './tax-case.reader.js'

/** The repositories a tax case is read from; each may be left out (tests, partial wiring). */
export interface TaxCaseRepositories {
  readonly wageTaxCertificate?: WageTaxCertificateRepository | undefined
  readonly salaryStatement?: CrossBorderSalaryStatementRepository | undefined
  readonly commute?: CommuteRepository | undefined
  readonly interview?: InterviewAnswerRepository | undefined
  readonly masterData?: MasterDataRepository | undefined
  readonly profile?: ProfileRepository | undefined
  readonly pension?: PensionRepository | undefined
  readonly capital?: CapitalRepository | undefined
  readonly rental?: RentalRepository | undefined
  readonly children?: ChildRepository | undefined
  readonly coupling?: PartnerCouplingRepository | undefined
}

type Loaders = { readonly [P in TaxCasePart]: (userId: string, taxYear: number) => Promise<TaxCaseRecords[P]> }

function loadersOver(repositories: TaxCaseRepositories): Loaders {
  const r = repositories
  return {
    wageTaxCertificate: (userId, year) => r.wageTaxCertificate?.findForUserAndYear(userId, year) ?? Promise.resolve(null),
    salaryStatement: (userId, year) => r.salaryStatement?.findForUserAndYear(userId, year) ?? Promise.resolve(null),
    commute: (userId, year) => r.commute?.findForUserAndYear(userId, year) ?? Promise.resolve(null),
    interviewRows: (userId, year) => r.interview?.findAllForUserAndYear(userId, year) ?? Promise.resolve([]),
    masterData: (userId) => r.masterData?.findByUserId(userId) ?? Promise.resolve(null),
    profile: (userId) => r.profile?.findByUserId(userId) ?? Promise.resolve(null),
    pension: (userId, year) => r.pension?.findForUserAndYear(userId, year) ?? Promise.resolve(null),
    capital: (userId, year) => r.capital?.findForUserAndYear(userId, year) ?? Promise.resolve(null),
    rentals: (userId, year) => r.rental?.listForUserAndYear(userId, year) ?? Promise.resolve([]),
    children: (userId, year) => r.children?.listForUserAndYear(userId, year) ?? Promise.resolve([]),
    // Without Person B's consent for the year, Person A's computations get the coupling without B (decision 3).
    coupling: async (userId, year) => couplingForDataAccess((await r.coupling?.findByUserAndYear(userId, year)) ?? null, userId),
  }
}

/** Reads a tax case from the repositories over a plain object of them (tests, scripts). */
export function taxCaseReaderOver(repositories: TaxCaseRepositories): TaxCaseReader {
  const loaders = loadersOver(repositories)
  return {
    async read<P extends TaxCasePart>(userId: string, taxYear: number, parts: readonly P[]): Promise<Pick<TaxCaseRecords, P>> {
      const values = await Promise.all(parts.map((part) => loaders[part](userId, taxYear)))
      const records: Partial<Record<P, unknown>> = {}
      parts.forEach((part, index) => {
        records[part] = values[index]
      })
      return records as Pick<TaxCaseRecords, P>
    },
  }
}

/** The tax case as the repositories store it (ADR-0102): the one place that knows which repository holds which part. */
@Injectable()
export class RepositoryTaxCaseReader implements TaxCaseReader {
  private readonly reader: TaxCaseReader

  constructor(
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) wageTaxCertificate: WageTaxCertificateRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) salaryStatement: CrossBorderSalaryStatementRepository,
    @Inject(COMMUTE_REPOSITORY) commute: CommuteRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) interview: InterviewAnswerRepository,
    @Inject(MASTER_DATA_REPOSITORY) masterData: MasterDataRepository,
    @Inject(PROFILE_REPOSITORY) profile: ProfileRepository,
    @Inject(PENSION_REPOSITORY) pension: PensionRepository,
    @Inject(CAPITAL_REPOSITORY) capital: CapitalRepository,
    @Inject(RENTAL_REPOSITORY) rental: RentalRepository,
    @Inject(CHILD_REPOSITORY) children: ChildRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) coupling: PartnerCouplingRepository,
  ) {
    this.reader = taxCaseReaderOver({ wageTaxCertificate, salaryStatement, commute, interview, masterData, profile, pension, capital, rental, children, coupling })
  }

  read<P extends TaxCasePart>(userId: string, taxYear: number, parts: readonly P[]): Promise<Pick<TaxCaseRecords, P>> {
    return this.reader.read(userId, taxYear, parts)
  }
}
