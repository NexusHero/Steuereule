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
  // Exported so AccountModule's export assembly (REQ-011/ADR-0013) can inject the
  // same repository directly — it reads the decrypted Profile without going through
  // ProfileService, so it never double-appends ProfileService.getProfile's own
  // "profile" READ audit entry; the export path appends exactly one "export" READ
  // entry itself (see AccountExportService.recordExportRead).
  exports: [PROFILE_REPOSITORY],
})
export class ProfileModule {}
