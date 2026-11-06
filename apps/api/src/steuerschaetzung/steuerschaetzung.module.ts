import { Module } from '@nestjs/common'
import { CommuteModule } from '../arbeitsweg/arbeitsweg.module.js'
import { ChSalaryCertificateModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KinderModule } from '../kinder/kinder.module.js'
import { LinkModule } from '../kopplung/kopplung.module.js'
import { RentalModule } from '../vermietung/vermietung.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { MasterDataModule } from '../stammdaten/stammdaten.module.js'
import { TaxEstimateController } from './steuerschaetzung.controller.js'
import { TaxEstimateService } from './steuerschaetzung.service.js'

@Module({
  imports: [LstbModule, InterviewModule, ChSalaryCertificateModule, MasterDataModule, CommuteModule, LinkModule, KinderModule, RentalModule],
  controllers: [TaxEstimateController],
  providers: [TaxEstimateService],
})
export class TaxEstimateModule {}
