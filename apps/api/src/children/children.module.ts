import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-salary-certificate/ch-salary-certificate.module.js'
import { LinkModule } from '../link/link.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ChildrenController } from './children.controller.js'
import { ChildrenService } from './children.service.js'
import { CHILD_REPOSITORY } from './child.repository.js'
import { PrismaChildRepository } from './child.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ChSalaryCertificateModule, LinkModule],
  controllers: [ChildrenController],
  providers: [
    ChildrenService,
    {
      provide: CHILD_REPOSITORY,
      useClass: PrismaChildRepository,
    },
  ],
  exports: [ChildrenService, CHILD_REPOSITORY],
})
export class ChildrenModule {}
