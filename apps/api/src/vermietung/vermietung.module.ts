import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { VermietungController } from './vermietung.controller.js'
import { VERMIETUNG_REPOSITORY } from './vermietung.repository.js'
import { PrismaVermietungRepository } from './vermietung.repository.prisma.js'
import { VermietungService } from './vermietung.service.js'

@Module({
  imports: [PrismaModule, AuditModule, InterviewModule],
  controllers: [VermietungController],
  providers: [VermietungService, { provide: VERMIETUNG_REPOSITORY, useClass: PrismaVermietungRepository }],
})
export class VermietungModule {}
