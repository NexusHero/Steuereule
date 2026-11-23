import { Module, type OnModuleInit } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PrintoutModule } from '../printout/printout.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { BOOKING_FIELD_ACCESS, bookingFieldAccess } from './booking-field-access.js'
import { BusinessController } from './business.controller.js'
import { BUSINESS_REPOSITORY } from './business.repository.js'
import { PrismaBusinessRepository } from './business.repository.prisma.js'
import { BusinessContext } from './business-context.js'
import { BusinessService } from './business.service.js'
import { HEBESATZ_DIRECTORY } from './business.tokens.js'
import { ElsterHelpService } from './elster-help.service.js'
import { HebesatzDirectory } from './hebesatz.js'
import { loadSuppliedElsterLines } from './elster-supplied-lines.js'

/** Selbstständige (ADR-0101): profile, book, bank import, assets, closing, VAT, trade tax, fill-in help, exports. */
@Module({
  imports: [PrismaModule, AuditModule, InterviewModule, UnlockModule, PrintoutModule],
  controllers: [BusinessController],
  providers: [
    BusinessContext,
    BusinessService,
    ElsterHelpService,
    { provide: BUSINESS_REPOSITORY, useClass: PrismaBusinessRepository },
    { provide: HEBESATZ_DIRECTORY, useFactory: () => new HebesatzDirectory() },
    { provide: BOOKING_FIELD_ACCESS, inject: [BusinessService], useFactory: (service: BusinessService) => bookingFieldAccess(service) },
  ],
  exports: [BusinessService, BOOKING_FIELD_ACCESS],
})
export class BusinessModule implements OnModuleInit {
  /** Anlage S/G lines read off Mein ELSTER, where the operator filed them (ADR-0101 §22). */
  onModuleInit(): void {
    loadSuppliedElsterLines()
  }
}
