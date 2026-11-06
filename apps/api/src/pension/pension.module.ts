import { Module } from '@nestjs/common'
import { MarkingModule } from '../marking/marking.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PensionController } from './pension.controller.js'
import { PENSION_REPOSITORY } from './pension.repository.js'
import { PrismaPensionRepository } from './pension.repository.prisma.js'
import { PensionService } from './pension.service.js'

@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, InterviewModule],
  controllers: [PensionController],
  providers: [PensionService, { provide: PENSION_REPOSITORY, useClass: PrismaPensionRepository }],
  exports: [PENSION_REPOSITORY],
})
export class PensionModule {}
