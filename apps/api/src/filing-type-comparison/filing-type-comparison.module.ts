import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { TaxYearModule } from '../tax-year/tax-year.module.js'
import { FilingTypeComparisonController } from './filing-type-comparison.controller.js'
import { AssessmentComparisonService } from './filing-type-comparison.service.js'

@Module({
  imports: [PrismaModule, AuditModule, TaxCaseModule, TaxYearModule],
  controllers: [FilingTypeComparisonController],
  providers: [AssessmentComparisonService],
})
export class FilingTypeComparisonModule {}
