import { Module } from '@nestjs/common'
import { AccountModule } from './account/account.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { DeviceModule } from './device/device.module.js'
import { ProfileModule } from './profile/profile.module.js'

@Module({
  imports: [AuthModule, ProfileModule, CockpitModule, AccountModule, DeviceModule],
})
export class AppModule {}
