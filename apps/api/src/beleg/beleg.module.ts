import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BelegController } from './beleg.controller.js'
import { BELEG_REPOSITORY } from './beleg.repository.js'
import { PrismaBelegRepository } from './beleg.repository.prisma.js'
import { BelegService } from './beleg.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BelegController],
  providers: [BelegService, { provide: BELEG_REPOSITORY, useClass: PrismaBelegRepository }],
})
export class BelegModule {}
