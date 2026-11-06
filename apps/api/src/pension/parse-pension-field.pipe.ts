import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { PENSION_FIELDS, type PensionFieldId } from '@steuereule/core'

@Injectable()
export class ParsePensionFieldPipe implements PipeTransform<unknown, PensionFieldId> {
  transform(value: unknown): PensionFieldId {
    if (typeof value !== 'string' || !(PENSION_FIELDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${PENSION_FIELDS.join(', ')}`)
    }
    return value as PensionFieldId
  }
}
