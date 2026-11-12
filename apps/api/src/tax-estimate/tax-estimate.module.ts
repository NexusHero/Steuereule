import { Module } from '@nestjs/common'
import { CommuteModule } from '../commute/commute.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { LinkModule } from '../link/link.module.js'
import { RentalModule } from '../rental/rental.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { TaxEstimateController } from './tax-estimate.controller.js'
import { TaxEstimateService } from './tax-estimate.service.js'

@Module({
  imports: [LstbModule, InterviewModule, ChSalaryCertificateModule, MasterDataModule, CommuteModule, LinkModule, ChildrenModule, RentalModule],
  controllers: [TaxEstimateController],
  providers: [TaxEstimateService],
  exports: [TaxEstimateService],
})
export class TaxEstimateModule {}
