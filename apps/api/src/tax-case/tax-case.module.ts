import { Module } from '@nestjs/common'
import { CapitalModule } from '../capital/capital.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { CommuteModule } from '../commute/commute.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LinkModule } from '../link/link.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { PensionModule } from '../pension/pension.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { RepositoryTaxCaseReader } from './repository-tax-case.reader.js'
import { TAX_CASE_READER } from './tax-case.reader.js'

/** The tax case of a person and year, read from the data modules' repositories (ADR-0102). */
@Module({
  imports: [LstbModule, ChSalaryCertificateModule, CommuteModule, InterviewModule, MasterDataModule, ProfileModule, PensionModule, CapitalModule, RentalModule, ChildrenModule, LinkModule],
  providers: [{ provide: TAX_CASE_READER, useClass: RepositoryTaxCaseReader }],
  exports: [TAX_CASE_READER],
})
export class TaxCaseModule {}
