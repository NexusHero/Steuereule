import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { StammdatenController } from './stammdaten.controller.js'
import { STAMMDATEN_REPOSITORY } from './stammdaten.repository.js'
import { PrismaStammdatenRepository } from './stammdaten.repository.prisma.js'
import { StammdatenService } from './stammdaten.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StammdatenController],
  providers: [StammdatenService, { provide: STAMMDATEN_REPOSITORY, useClass: PrismaStammdatenRepository }],
  exports: [STAMMDATEN_REPOSITORY],
})
export class StammdatenModule {}
