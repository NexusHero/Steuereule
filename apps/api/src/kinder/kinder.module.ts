import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { KinderController } from './kinder.controller.js'
import { KinderService } from './kinder.service.js'
import { KIND_REPOSITORY } from './kind.repository.js'
import { PrismaKindRepository } from './kind.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ChLohnausweisModule, KopplungModule],
  controllers: [KinderController],
  providers: [
    KinderService,
    {
      provide: KIND_REPOSITORY,
      useClass: PrismaKindRepository,
    },
  ],
  exports: [KinderService, KIND_REPOSITORY],
})
export class KinderModule {}
