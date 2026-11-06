import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { AuthModule } from '../auth/auth.module.js'
import { CockpitModule } from '../cockpit/cockpit.module.js'
import { PrintoutModule } from '../printout/printout.module.js'
import { ConfirmationModule } from '../confirmation/confirmation.module.js'
import { OwlModeModule } from '../owl-mode/owl-mode.module.js'
import { ReceiptModule } from '../receipt/receipt.module.js'
import { UnlockModule } from '../unlock/unlock.module.js'
import { ProfileModule } from '../profile/profile.module.js'
import { MasterDataModule } from '../master-data/master-data.module.js'
import { AuditModule } from '../audit/audit.module.js'
import { McpController } from './mcp.controller.js'
import { McpService } from './mcp.service.js'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CockpitModule,
    PrintoutModule,
    ConfirmationModule,
    OwlModeModule,
    ReceiptModule,
    UnlockModule,
    ProfileModule,
    MasterDataModule,
    AuditModule,
  ],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
