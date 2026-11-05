import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { PROVENANCE_REPOSITORY } from './kennzeichnung.repository.js'
import { PrismaKennzeichnungRepository } from './kennzeichnung.repository.prisma.js'

@Module({
  imports: [PrismaModule],
  providers: [{ provide: PROVENANCE_REPOSITORY, useClass: PrismaKennzeichnungRepository }],
  exports: [PROVENANCE_REPOSITORY],
})
export class KennzeichnungModule {}
