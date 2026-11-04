import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { LSTB_FELDER, type LstbFeldId } from '@steuereule/core'

@Injectable()
export class ParseLstbFeldPipe implements PipeTransform<unknown, LstbFeldId> {
  transform(value: unknown): LstbFeldId {
    if (typeof value !== 'string' || !(LSTB_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${LSTB_FELDER.join(', ')}`)
    }
    return value as LstbFeldId
  }
}
