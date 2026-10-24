import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { LstbController } from './lstb.controller.js'
import { LSTB_REPOSITORY } from './lstb.repository.js'
import { PrismaLstbRepository } from './lstb.repository.prisma.js'
import { LstbService } from './lstb.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [LstbController],
  providers: [LstbService, { provide: LSTB_REPOSITORY, useClass: PrismaLstbRepository }],
})
export class LstbModule {}
