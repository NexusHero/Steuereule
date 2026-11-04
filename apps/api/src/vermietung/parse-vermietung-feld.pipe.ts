import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { VERMIETUNG_FELDER, type VermietungFeldId } from '@steuereule/core'

@Injectable()
export class ParseVermietungFeldPipe implements PipeTransform<unknown, VermietungFeldId> {
  transform(value: unknown): VermietungFeldId {
    if (typeof value !== 'string' || !(VERMIETUNG_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${VERMIETUNG_FELDER.join(', ')}`)
    }
    return value as VermietungFeldId
  }
}
