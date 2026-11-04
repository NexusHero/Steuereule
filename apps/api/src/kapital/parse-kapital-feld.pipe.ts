import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { KAPITAL_FELDER, type KapitalFeldId } from '@steuereule/core'

@Injectable()
export class ParseKapitalFeldPipe implements PipeTransform<unknown, KapitalFeldId> {
  transform(value: unknown): KapitalFeldId {
    if (typeof value !== 'string' || !(KAPITAL_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${KAPITAL_FELDER.join(', ')}`)
    }
    return value as KapitalFeldId
  }
}
