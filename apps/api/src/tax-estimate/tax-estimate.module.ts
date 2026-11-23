import { Module } from '@nestjs/common'
import { BusinessModule } from '../business/business.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { TaxEstimateController } from './tax-estimate.controller.js'
import { TaxEstimateService } from './tax-estimate.service.js'

@Module({
  imports: [TaxCaseModule, BusinessModule],
  controllers: [TaxEstimateController],
  providers: [TaxEstimateService],
  exports: [TaxEstimateService],
})
export class TaxEstimateModule {}
