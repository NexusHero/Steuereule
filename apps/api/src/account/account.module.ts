import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AccountDeletionController } from './account-deletion.controller.js'
import { PrismaAccountDeletionRepository } from './account-deletion.repository.prisma.js'
import { ACCOUNT_DELETION_REPOSITORY } from './account-deletion.repository.js'
import { AccountDeletionService } from './account-deletion.service.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'

// The shared `v1/account` module (REQ-011/ADR-0013), owned jointly by two parallel
// tracks under one Controller('v1/account') base:
//   - BE-B (#128, this file's DELETE wiring) — `AccountDeletionController` /
//     `AccountDeletionService` / `account-deletion.repository(.prisma).ts` /
//     `delete-account-transaction.ts`.
//   - BE-A (#127, Robin's export endpoint) — additive: drop in
//     `account-export.controller.ts` / `account-export.service.ts` (reusing
//     `PROFILE_REPOSITORY`/`ENCRYPTED_PRISMA` + `AUDIT_REPOSITORY` directly, the same
//     way ProfileService already does — export needs no new repository seam of its
//     own) and append `AccountExportController` to `controllers` and
//     `AccountExportService` to `providers` below. No existing line needs to change,
//     only new ones added — the whole point of keeping this module additive so the
//     two tracks rebase cleanly against each other.
@Module({
  imports: [PrismaModule],
  controllers: [AccountDeletionController],
  providers: [
    AccountDeletionService,
    FreshAuthChecker,
    { provide: ACCOUNT_DELETION_REPOSITORY, useClass: PrismaAccountDeletionRepository },
  ],
})
export class AccountModule {}
