import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { RenteController } from './rente.controller.js'
import { RENTE_REPOSITORY } from './rente.repository.js'
import { PrismaRenteRepository } from './rente.repository.prisma.js'
import { RenteService } from './rente.service.js'

@Module({
  imports: [PrismaModule, AuditModule, InterviewModule],
  controllers: [RenteController],
  providers: [RenteService, { provide: RENTE_REPOSITORY, useClass: PrismaRenteRepository }],
})
export class RenteModule {}
