import { Module } from '@nestjs/common'
import { FristenController } from './fristen.controller.js'
import { FristenService } from './fristen.service.js'

@Module({
  controllers: [FristenController],
  providers: [FristenService],
})
export class FristenModule {}
