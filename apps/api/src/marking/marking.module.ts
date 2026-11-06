import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PROVENANCE_REPOSITORY } from './marking.repository.js'
import { PrismaMarkingRepository } from './marking.repository.prisma.js'

@Module({
  imports: [PrismaModule],
  providers: [{ provide: PROVENANCE_REPOSITORY, useClass: PrismaMarkingRepository }],
  exports: [PROVENANCE_REPOSITORY],
})
export class MarkingModule {}
