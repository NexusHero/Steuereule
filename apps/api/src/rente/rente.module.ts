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
  // Exported so the Jahresübernahme (ticket 10.8 M2) can copy the Rente row through the SAME
  // field-encryption seam its own service uses — never a second Prisma read path.
  exports: [RENTE_REPOSITORY],
})
export class RenteModule {}
