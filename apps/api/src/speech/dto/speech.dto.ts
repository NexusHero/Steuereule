import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { SPEECH_LANGUAGES, type SpeechLanguage } from '../speech.port.js'

/** One passage: the app sends an answer sentence by sentence, so the first words play while the rest is still made. */
export const SPEECH_TEXT_MAX_CHARS = 600

export class SpeakDto {
  @ApiProperty({ type: String, maxLength: SPEECH_TEXT_MAX_CHARS, example: 'Daraus ergibt sich eine Entfernungspauschale von rund 3.030 Euro.', description: 'The passage to speak, as plain text without Markdown.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(SPEECH_TEXT_MAX_CHARS)
  text!: string

  @ApiProperty({ type: String, enum: SPEECH_LANGUAGES, example: 'de' })
  @IsIn(SPEECH_LANGUAGES)
  language!: SpeechLanguage
}
