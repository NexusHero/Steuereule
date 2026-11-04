import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module.js'
import { DeviceController } from './device.controller.js'
import { PrismaDeviceCodeRepository } from './device-code.repository.prisma.js'
import { DEVICE_CODE_REPOSITORY } from './device-code.repository.js'
import { DeviceService } from './device.service.js'
import { geoIpRegionResolverProvider } from './region/region-resolver.provider.js'

@Module({
  imports: [PrismaModule],
  controllers: [DeviceController],
  providers: [
    DeviceService,
    { provide: DEVICE_CODE_REPOSITORY, useClass: PrismaDeviceCodeRepository },
    geoIpRegionResolverProvider,
  ],
})
export class DeviceModule {}
