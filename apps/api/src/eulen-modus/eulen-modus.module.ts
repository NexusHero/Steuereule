import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { BelegModule } from '../beleg/beleg.module.js'
import { BescheidModule } from '../bescheid/bescheid.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KiModule } from '../ki/ki.module.js'
import { KinderModule } from '../kinder/kinder.module.js'
import { LstbModule } from '../lstb/lstb.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { EulenModusController } from './eulen-modus.controller.js'
import { EulenModusService } from './eulen-modus.service.js'
import {
  EULEN_EINSTELLUNG_REPOSITORY,
  EULEN_KARTEN_VERWURF_REPOSITORY,
} from './eulen-modus.repository.js'
import {
  PrismaEulenEinstellungRepository,
  PrismaEulenKartenVerwurfRepository,
} from './eulen-modus.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, LstbModule, BelegModule, KinderModule, InterviewModule, BescheidModule, KiModule],
  controllers: [EulenModusController],
  providers: [
    EulenModusService,
    {
      provide: EULEN_EINSTELLUNG_REPOSITORY,
      useClass: PrismaEulenEinstellungRepository,
    },
    {
      provide: EULEN_KARTEN_VERWURF_REPOSITORY,
      useClass: PrismaEulenKartenVerwurfRepository,
    },
  ],
  exports: [EulenModusService, EULEN_EINSTELLUNG_REPOSITORY, EULEN_KARTEN_VERWURF_REPOSITORY],
})
export class EulenModusModule {}
