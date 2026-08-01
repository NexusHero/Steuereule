import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { DeviceController } from './device.controller.js'
import { PrismaDeviceCodeRepository } from './device-code.repository.prisma.js'
import { DEVICE_CODE_REPOSITORY } from './device-code.repository.js'
import { DeviceService } from './device.service.js'
import { geoIpRegionResolverProvider } from './region/region-resolver.provider.js'

// AuthModule is @Global() (see auth.module.ts) so BETTER_AUTH_BUNDLE is available
// here without an explicit import, exactly as ProfileController/FreshAuthChecker
// already rely on for UserContextGuard.
@Module({
  imports: [PrismaModule],
  controllers: [DeviceController],
  providers: [DeviceService, { provide: DEVICE_CODE_REPOSITORY, useClass: PrismaDeviceCodeRepository }, geoIpRegionResolverProvider],
})
export class DeviceModule {}
