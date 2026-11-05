import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { KinderController } from './kinder.controller.js'
import { ChildrenService } from './kinder.service.js'
import { CHILD_REPOSITORY } from './kind.repository.js'
import { PrismaKindRepository } from './kind.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ChLohnausweisModule, KopplungModule],
  controllers: [KinderController],
  providers: [
    ChildrenService,
    {
      provide: CHILD_REPOSITORY,
      useClass: PrismaKindRepository,
    },
  ],
  exports: [ChildrenService, CHILD_REPOSITORY],
})
export class KinderModule {}
