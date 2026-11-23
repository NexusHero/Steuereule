import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { TaxCaseModule } from '../tax-case/tax-case.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { PrintoutController } from './printout.controller.js'
import { ACROFORM_TEMPLATES_BASE, PrintoutService, TEMPLATES_BASE } from './printout.service.js'
import { PrintoutJobService } from './printout-job.service.js'

/** PrintoutService gets PRINTOUT_ESTIMATE from TaxEstimatePortsModule (global, bound once in AppModule). */
@Module({
  imports: [TaxCaseModule, MarkingModule, AuditModule, UnlockModule],
  controllers: [PrintoutController],
  providers: [
    PrintoutService,
    PrintoutJobService,
    { provide: TEMPLATES_BASE, useValue: new URL('../../assets/vordrucke/', import.meta.url) },
    { provide: ACROFORM_TEMPLATES_BASE, useValue: new URL('../../assets/vordrucke-acroform/', import.meta.url) },
  ],
  exports: [PrintoutService, PrintoutJobService],
})
export class PrintoutModule {}
