import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { BESCHEID_FELD_IDS, type AssessmentField } from '@steuereule/core'

/** Boundary validation for the `:feld` path param of the Bescheid endpoints. */
@Injectable()
export class ParseBescheidFeldPipe implements PipeTransform<string, AssessmentField> {
  transform(value: string): AssessmentField {
    if (!(BESCHEID_FELD_IDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`unknown Bescheid field "${value}"`)
    }
    return value as AssessmentField
  }
}
