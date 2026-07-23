import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AUDIT_REPOSITORY } from './audit.repository.js'
import { PrismaAuditRepository } from './audit.repository.prisma.js'
import { AuditService } from './audit.service.js'

@Module({
  imports: [PrismaModule],
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository }],
  exports: [AuditService],
})
export class AuditModule {}
