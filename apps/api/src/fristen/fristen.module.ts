import { Module } from '@nestjs/common'
import { DeadlinesController } from './fristen.controller.js'
import { DeadlinesService } from './fristen.service.js'

@Module({
  controllers: [DeadlinesController],
  providers: [DeadlinesService],
})
export class DeadlinesModule {}
