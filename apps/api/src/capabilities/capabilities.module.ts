import { Module } from '@nestjs/common'
import { SpeechModule } from '../speech/speech.module.js'
import { CapabilitiesController } from './capabilities.controller.js'

@Module({ imports: [SpeechModule], controllers: [CapabilitiesController] })
export class CapabilitiesModule {}
