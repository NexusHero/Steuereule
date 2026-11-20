import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { BOOKING_FIELD_ACCESS, bookingFieldAccess } from './booking-field-access.js'
import { BusinessController } from './business.controller.js'
import { BUSINESS_REPOSITORY } from './business.repository.js'
import { PrismaBusinessRepository } from './business.repository.prisma.js'
import { BusinessService, HEBESATZ_DIRECTORY } from './business.service.js'
import { HebesatzDirectory } from './hebesatz.js'

/** Selbstständige (ADR-0101): profile, book, bank import, assets, closing, VAT, trade tax, fill-in help, exports. */
@Module({
  imports: [PrismaModule, AuditModule, InterviewModule, UnlockModule],
  controllers: [BusinessController],
  providers: [
    BusinessService,
    { provide: BUSINESS_REPOSITORY, useClass: PrismaBusinessRepository },
    { provide: HEBESATZ_DIRECTORY, useFactory: () => new HebesatzDirectory() },
    { provide: BOOKING_FIELD_ACCESS, inject: [BusinessService], useFactory: (service: BusinessService) => bookingFieldAccess(service) },
  ],
  exports: [BusinessService, BOOKING_FIELD_ACCESS],
})
export class BusinessModule {}
