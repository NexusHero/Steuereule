import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { RENTEN_FELDER, type RentenFeldId } from '@steuereule/core'

@Injectable()
export class ParseRenteFeldPipe implements PipeTransform<unknown, RentenFeldId> {
  transform(value: unknown): RentenFeldId {
    if (typeof value !== 'string' || !(RENTEN_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${RENTEN_FELDER.join(', ')}`)
    }
    return value as RentenFeldId
  }
}
