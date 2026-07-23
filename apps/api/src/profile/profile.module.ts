import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileController } from './profile.controller.js'
import { PrismaProfileRepository } from './profile.repository.prisma.js'
import { PROFILE_REPOSITORY } from './profile.repository.js'
import { ProfileService } from './profile.service.js'

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    { provide: PROFILE_REPOSITORY, useClass: PrismaProfileRepository },
  ],
})
export class ProfileModule {}
