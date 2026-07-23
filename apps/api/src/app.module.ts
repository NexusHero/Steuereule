import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module.js'
import { CockpitModule } from './cockpit/cockpit.module.js'
import { ProfileModule } from './profile/profile.module.js'

@Module({
  imports: [AuthModule, ProfileModule, CockpitModule],
})
export class AppModule {}
