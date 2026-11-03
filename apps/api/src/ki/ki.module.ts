import { Module } from '@nestjs/common'
import { KI_PORT, RagKiAdapter } from './ki.adapter.js'

@Module({
  providers: [
    RagKiAdapter,
    {
      provide: KI_PORT,
      useExisting: RagKiAdapter,
    },
  ],
  exports: [KI_PORT, RagKiAdapter],
})
export class KiModule {}
