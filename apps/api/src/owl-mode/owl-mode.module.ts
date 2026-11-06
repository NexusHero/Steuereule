import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { AssessmentModule } from '../assessment/assessment.module.js'
import { InterviewModule } from '../interview/interview.module.js'
import { KiModule } from '../ki/ki.module.js'
import { ChildrenModule } from '../children/children.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { OwlModeController } from './owl-mode.controller.js'
import { OwlModeService } from './owl-mode.service.js'
import {
  OWL_SETTING_REPOSITORY,
  OWL_CARD_DISMISSAL_REPOSITORY,
} from './owl-mode.repository.js'
import {
  PrismaOwlSettingRepository,
  PrismaOwlCardDismissalRepository,
} from './owl-mode.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ChildrenModule, InterviewModule, AssessmentModule, KiModule],
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
