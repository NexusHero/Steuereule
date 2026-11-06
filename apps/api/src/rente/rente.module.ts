import { Module } from '@nestjs/common'
import { MarkingModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PensionController } from './rente.controller.js'
import { PENSION_REPOSITORY } from './rente.repository.js'
import { PrismaPensionRepository } from './rente.repository.prisma.js'
import { PensionService } from './rente.service.js'

@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, InterviewModule],
  controllers: [PensionController],
  providers: [PensionService, { provide: PENSION_REPOSITORY, useClass: PrismaPensionRepository }],
  exports: [PENSION_REPOSITORY],
})
export class PensionModule {}
