import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY } from './lstb.repository.js'
import { PrismaLstbRepository } from './lstb.repository.prisma.js'

@Module({
  imports: [PrismaModule],
  providers: [{ provide: WAGE_TAX_CERTIFICATE_REPOSITORY, useClass: PrismaLstbRepository }],
  exports: [WAGE_TAX_CERTIFICATE_REPOSITORY],
})
export class LstbDataModule {}
