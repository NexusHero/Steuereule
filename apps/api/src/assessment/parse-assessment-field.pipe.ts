import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { ASSESSMENT_FIELD_IDS, type AssessmentField } from '@steuereule/core'

/** Boundary validation for the `:feld` path param of the Bescheid endpoints. */
@Injectable()
export class ParseAssessmentFieldPipe implements PipeTransform<string, AssessmentField> {
  transform(value: string): AssessmentField {
    if (!(ASSESSMENT_FIELD_IDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`unknown Bescheid field "${value}"`)
    }
    return value as AssessmentField
  }
}
