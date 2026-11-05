import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BelegController } from './beleg.controller.js'
import { RECEIPT_REPOSITORY } from './beleg.repository.js'
import { PrismaBelegRepository } from './beleg.repository.prisma.js'
import { BelegService } from './beleg.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BelegController],
  providers: [BelegService, { provide: RECEIPT_REPOSITORY, useClass: PrismaBelegRepository }],
  exports: [RECEIPT_REPOSITORY, BelegService],
})
export class BelegModule {}
