import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { KENNZEICHNUNG_REPOSITORY } from './kennzeichnung.repository.js'
import { PrismaKennzeichnungRepository } from './kennzeichnung.repository.prisma.js'

@Module({
  imports: [PrismaModule],
  providers: [{ provide: KENNZEICHNUNG_REPOSITORY, useClass: PrismaKennzeichnungRepository }],
  exports: [KENNZEICHNUNG_REPOSITORY],
})
export class KennzeichnungModule {}
