import { Module } from '@nestjs/common'
import { MarkingModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RentalController } from './vermietung.controller.js'
import { RENTAL_REPOSITORY } from './vermietung.repository.js'
import { PrismaRentalRepository } from './vermietung.repository.prisma.js'
import { RentalService } from './vermietung.service.js'

@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, InterviewModule],
  controllers: [RentalController],
  providers: [RentalService, { provide: RENTAL_REPOSITORY, useClass: PrismaRentalRepository }],
  exports: [RENTAL_REPOSITORY],
})
export class RentalModule {}
