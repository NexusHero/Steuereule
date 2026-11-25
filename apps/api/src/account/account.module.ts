import { HouseholdCoreModule } from '../household-core/household-core.module.js'
import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module.js'
import { PrismaModule } from '../prisma/prisma.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'
import { GuestRetentionService } from './guest-retention.service.js'
import { LifecycleSweepService } from './lifecycle-sweep.service.js'
import { LIFECYCLE_SWEEP_REPOSITORY } from './lifecycle-sweep.repository.js'
import { PrismaLifecycleSweepRepository } from './lifecycle-sweep.repository.prisma.js'
import { GUEST_ACTIVITY_REPOSITORY } from '../guest/guest-activity.repository.js'
import { PrismaGuestActivityRepository } from '../guest/guest-activity.repository.prisma.js'
import { STEP_UP_GRANT_REPOSITORY } from '../auth/step-up-grant.repository.js'
import { PrismaStepUpGrantRepository } from '../auth/step-up-grant.repository.prisma.js'
import { AccountDeletionController } from './account-deletion.controller.js'
import { AccountExportController } from './account-export.controller.js'
import { KeystoreModule } from '../keystore/keystore.module.js'
import { ReceiptStorageModule } from '../receipt/receipt-storage.module.js'
import { PrismaAccountDeletionRepository } from './account-deletion.repository.prisma.js'
import { ACCOUNT_DELETION_REPOSITORY } from './account-deletion.repository.js'
import { AccountDeletionService } from './account-deletion.service.js'
import { AccountExportService } from './account-export.service.js'
import { ACCOUNT_IDENTITY_REPOSITORY } from './account-identity.repository.js'
import { PrismaAccountIdentityRepository } from './account-identity.repository.prisma.js'
import { PDF_RENDERER } from './export/pdf-renderer.js'
import { PlaywrightPdfRenderer } from './export/pdf-renderer.playwright.js'
import { TAX_DATA_EXPORT_REPOSITORY } from './tax-data-export.repository.js'
import { PrismaTaxDataExportRepository } from './tax-data-export.repository.prisma.js'

@Module({
  imports: [PrismaModule, AuditModule, ProfileModule, KeystoreModule, HouseholdCoreModule, ReceiptStorageModule],
  controllers: [AccountDeletionController, AccountExportController],
  providers: [
    GuestRetentionService,
    LifecycleSweepService,
    { provide: LIFECYCLE_SWEEP_REPOSITORY, useClass: PrismaLifecycleSweepRepository },
    { provide: GUEST_ACTIVITY_REPOSITORY, useClass: PrismaGuestActivityRepository },
    AccountDeletionService,
    AccountExportService,
    FreshAuthChecker,
    { provide: STEP_UP_GRANT_REPOSITORY, useClass: PrismaStepUpGrantRepository },
    { provide: ACCOUNT_DELETION_REPOSITORY, useClass: PrismaAccountDeletionRepository },
    { provide: ACCOUNT_IDENTITY_REPOSITORY, useClass: PrismaAccountIdentityRepository },
    { provide: PDF_RENDERER, useClass: PlaywrightPdfRenderer },
    { provide: TAX_DATA_EXPORT_REPOSITORY, useClass: PrismaTaxDataExportRepository },
  ],
})
export class AccountModule {}
