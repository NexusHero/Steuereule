import { Module } from '@nestjs/common'
import { KennzeichnungModule } from '../kennzeichnung/kennzeichnung.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { KopplungModule } from '../kopplung/kopplung.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { LstbController } from './lstb.controller.js'
import { LSTB_REPOSITORY } from './lstb.repository.js'
import { PrismaLstbRepository } from './lstb.repository.prisma.js'
import { LstbService } from './lstb.service.js'

@Module({
  imports: [KennzeichnungModule, PrismaModule, AuditModule, KopplungModule],
  controllers: [LstbController],
  providers: [LstbService, { provide: LSTB_REPOSITORY, useClass: PrismaLstbRepository }],
  exports: [LSTB_REPOSITORY],
})
export class LstbModule {}
