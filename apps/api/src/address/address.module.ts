import { Module } from '@nestjs/common'
import { AddressController } from './address.controller.js'
import { AddressService } from './address.service.js'
import { streetIndexProvider } from './street-index.provider.js'

@Module({
  controllers: [AddressController],
  providers: [AddressService, streetIndexProvider],
})
export class AddressModule {}
