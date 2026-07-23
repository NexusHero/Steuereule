import { Module } from '@nestjs/common'
import { ProfileModule } from './profile/profile.module.js'

@Module({
  imports: [ProfileModule],
})
export class AppModule {}
