import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { ASSESSMENT_FIELD_IDS, isAssessmentPositionId } from '@steuereule/core'
import type { AssessmentStoredField } from './assessment.repository.js'

/** Boundary validation for the `:feld` path param: one of the five figures or a Besteuerungsgrundlage (ADR-0098). */
@Injectable()
export class ParseAssessmentFieldPipe implements PipeTransform<string, AssessmentStoredField> {
  transform(value: string): AssessmentStoredField {
    if (!(ASSESSMENT_FIELD_IDS as readonly string[]).includes(value) && !isAssessmentPositionId(value)) {
      throw new BadRequestException(`unknown Bescheid field "${value}"`)
    }
    return value as AssessmentStoredField
  }
}
