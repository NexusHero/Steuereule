import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { LinkModule } from '../link/link.module.js'
import { MarkingModule } from '../marking/marking.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { LstbController } from './lstb.controller.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY } from './lstb.repository.js'
import { PrismaLstbRepository } from './lstb.repository.prisma.js'
import { LstbService } from './lstb.service.js'

@Module({
  imports: [MarkingModule, PrismaModule, AuditModule, LinkModule],
  controllers: [LstbController],
  providers: [LstbService, { provide: WAGE_TAX_CERTIFICATE_REPOSITORY, useClass: PrismaLstbRepository }],
  exports: [WAGE_TAX_CERTIFICATE_REPOSITORY, LstbService],
})
export class LstbModule {}
