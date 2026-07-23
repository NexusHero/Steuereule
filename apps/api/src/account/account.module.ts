import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'
import { AccountDeletionController } from './account-deletion.controller.js'
import { AccountExportController } from './account-export.controller.js'
import { PrismaAccountDeletionRepository } from './account-deletion.repository.prisma.js'
import { ACCOUNT_DELETION_REPOSITORY } from './account-deletion.repository.js'
import { AccountDeletionService } from './account-deletion.service.js'
import { AccountExportService } from './account-export.service.js'
import { ACCOUNT_IDENTITY_REPOSITORY } from './account-identity.repository.js'
import { PrismaAccountIdentityRepository } from './account-identity.repository.prisma.js'
import { PDF_RENDERER } from './export/pdf-renderer.js'
import { PlaywrightPdfRenderer } from './export/pdf-renderer.playwright.js'

// The shared `v1/account` module (REQ-011/ADR-0013), owned jointly by two parallel
// tracks under one Controller('v1/account') base:
//   - BE-B (#128, DELETE wiring) — `AccountDeletionController` /
//     `AccountDeletionService` / `account-deletion.repository(.prisma).ts` /
//     `delete-account-transaction.ts`.
//   - BE-A (#127, export endpoint) — `AccountExportController` /
//     `AccountExportService` / `account-identity.repository(.prisma).ts` /
//     `export/pdf-renderer.playwright.ts`.
//     Reuses `PROFILE_REPOSITORY`/`ENCRYPTED_PRISMA` + `AUDIT_REPOSITORY` directly,
//     the same way ProfileService already does — export needs no new repository
//     seam of its own beyond AccountIdentityRepository.
@Module({
  imports: [PrismaModule, AuditModule, ProfileModule],
  controllers: [AccountDeletionController, AccountExportController],
  providers: [
    AccountDeletionService,
    AccountExportService,
    FreshAuthChecker,
    { provide: ACCOUNT_DELETION_REPOSITORY, useClass: PrismaAccountDeletionRepository },
    { provide: ACCOUNT_IDENTITY_REPOSITORY, useClass: PrismaAccountIdentityRepository },
    { provide: PDF_RENDERER, useClass: PlaywrightPdfRenderer },
  ],
})
export class AccountModule {}
