import { Global, Module } from '@nestjs/common'
import { HOUSEHOLD_ESTIMATE } from '../capital/household-estimate.port.js'
import { PRINTOUT_ESTIMATE } from '../printout/printout-estimate.port.js'
import { TaxEstimateModule } from './tax-estimate.module.js'
import { TaxEstimateService } from './tax-estimate.service.js'

/**
 * Binds the estimate ports that modules below TaxEstimateModule own (ADR-0102): CapitalModule and
 * PrintoutModule need the estimate, but the estimate reads their records (and, through the book of the
 * self-employed, the printout), so neither can import TaxEstimateModule. Global, and imported once by
 * AppModule, it is the composition root's binding: the consumers name only their own token.
 */
@Global()
@Module({
  imports: [TaxEstimateModule],
  providers: [
    { provide: HOUSEHOLD_ESTIMATE, useExisting: TaxEstimateService },
    { provide: PRINTOUT_ESTIMATE, useExisting: TaxEstimateService },
  ],
  exports: [HOUSEHOLD_ESTIMATE, PRINTOUT_ESTIMATE],
})
export class TaxEstimatePortsModule {}
