import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChSalaryCertificateModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { LinkModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { KinderController } from './kinder.controller.js'
import { ChildrenService } from './kinder.service.js'
import { CHILD_REPOSITORY } from './kind.repository.js'
import { PrismaChildRepository } from './kind.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ChSalaryCertificateModule, LinkModule],
  controllers: [KinderController],
  providers: [
    ChildrenService,
    {
      provide: CHILD_REPOSITORY,
      useClass: PrismaChildRepository,
    },
  ],
  exports: [ChildrenService, CHILD_REPOSITORY],
})
export class KinderModule {}
