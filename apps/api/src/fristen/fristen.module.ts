import { Module } from '@nestjs/common'
import { FristenController } from './fristen.controller.js'
import { DeadlinesService } from './fristen.service.js'

@Module({
  controllers: [FristenController],
  providers: [DeadlinesService],
})
export class FristenModule {}
