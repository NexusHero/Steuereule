import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { CAPITAL_FIELDS, type CapitalFieldId } from '@steuereule/core'

@Injectable()
export class ParseCapitalFieldPipe implements PipeTransform<unknown, CapitalFieldId> {
  transform(value: unknown): CapitalFieldId {
    if (typeof value !== 'string' || !(CAPITAL_FIELDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${CAPITAL_FIELDS.join(', ')}`)
    }
    return value as CapitalFieldId
  }
}
