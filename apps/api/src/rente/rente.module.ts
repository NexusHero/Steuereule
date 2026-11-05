import { Module } from '@nestjs/common'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RenteController } from './rente.controller.js'
import { PENSION_REPOSITORY } from './rente.repository.js'
import { PrismaRenteRepository } from './rente.repository.prisma.js'
import { RenteService } from './rente.service.js'

@Module({
  imports: [KennzeichnungModule, PrismaModule, AuditModule, InterviewModule],
  controllers: [RenteController],
  providers: [RenteService, { provide: PENSION_REPOSITORY, useClass: PrismaRenteRepository }],
  exports: [PENSION_REPOSITORY],
})
export class RenteModule {}
