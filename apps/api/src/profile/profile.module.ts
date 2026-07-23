import { Module } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ProfileController } from './profile.controller.js'
import { PrismaProfileRepository } from './profile.repository.prisma.js'
import { PROFILE_REPOSITORY } from './profile.repository.js'
import { ProfileService } from './profile.service.js'

@Module({
  controllers: [ProfileController],
  providers: [
    PrismaService,
    ProfileService,
    { provide: PROFILE_REPOSITORY, useClass: PrismaProfileRepository },
  ],
})
export class ProfileModule {}
