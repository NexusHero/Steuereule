import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { AssessmentModule } from '../bescheid/bescheid.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KiModule } from '../ki/ki.module.js'
import { KinderModule } from '../kinder/kinder.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { OwlModeController } from './eulen-modus.controller.js'
import { OwlModeService } from './eulen-modus.service.js'
import {
  OWL_SETTING_REPOSITORY,
  OWL_CARD_DISMISSAL_REPOSITORY,
} from './eulen-modus.repository.js'
import {
  PrismaOwlSettingRepository,
  PrismaOwlCardDismissalRepository,
} from './eulen-modus.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, KinderModule, InterviewModule, AssessmentModule, KiModule],
  controllers: [OwlModeController],
  providers: [
    OwlModeService,
    {
      provide: OWL_SETTING_REPOSITORY,
      useClass: PrismaOwlSettingRepository,
    },
    {
      provide: OWL_CARD_DISMISSAL_REPOSITORY,
      useClass: PrismaOwlCardDismissalRepository,
    },
  ],
  exports: [OwlModeService, OWL_SETTING_REPOSITORY, OWL_CARD_DISMISSAL_REPOSITORY],
})
export class OwlModeModule {}
