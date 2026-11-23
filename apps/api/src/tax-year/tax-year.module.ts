import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { TAX_YEAR_REPOSITORY } from './tax-year.repository.js'
import { PrismaTaxYearRepository } from './tax-year.repository.prisma.js'

/** The tax-year rows (open items per year), read by the Cockpit, the capital check and the filing-type comparison. */
@Module({
  imports: [PrismaModule],
  providers: [{ provide: TAX_YEAR_REPOSITORY, useClass: PrismaTaxYearRepository }],
  exports: [TAX_YEAR_REPOSITORY],
})
export class TaxYearModule {}
