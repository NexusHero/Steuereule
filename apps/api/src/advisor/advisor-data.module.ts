import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ADVISOR_REPOSITORY } from './advisor.repository.js'
import { PrismaAdvisorRepository } from './advisor.repository.prisma.js'

@Module({
  imports: [PrismaModule],
  providers: [{ provide: ADVISOR_REPOSITORY, useClass: PrismaAdvisorRepository }],
  exports: [ADVISOR_REPOSITORY],
})
export class AdvisorDataModule {}
