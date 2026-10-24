import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { ChLohnausweisModule } from '../ch-lohnausweis/ch-lohnausweis.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { BescheidController } from './bescheid.controller.js'
import { BESCHEID_REPOSITORY } from './bescheid.repository.js'
import { PrismaBescheidRepository } from './bescheid.repository.prisma.js'
import { BescheidService } from './bescheid.service.js'

@Module({
  // The CH-Lohnausweis / Lstb / Interview modules export their repository tokens so BescheidService
  // can fold the computed "berechnet" side through the SAME seams the Cockpit and CH services use.
  imports: [PrismaModule, AuditModule, LstbModule, InterviewModule, ChLohnausweisModule],
  controllers: [BescheidController],
  providers: [BescheidService, { provide: BESCHEID_REPOSITORY, useClass: PrismaBescheidRepository }],
})
export class BescheidModule {}
