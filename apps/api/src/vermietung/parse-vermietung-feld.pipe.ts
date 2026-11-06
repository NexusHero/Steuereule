import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { RENTAL_FIELDS, type RentalFieldId } from '@steuereule/core'

@Injectable()
export class ParseRentalFieldPipe implements PipeTransform<unknown, RentalFieldId> {
  transform(value: unknown): RentalFieldId {
    if (typeof value !== 'string' || !(RENTAL_FIELDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${RENTAL_FIELDS.join(', ')}`)
    }
    return value as RentalFieldId
  }
}
