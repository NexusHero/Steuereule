import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { LOHNAUSWEIS_BETRAG_FELDER, type LohnausweisBetragFeldId } from '@steuereule/core'

@Injectable()
export class ParseLohnausweisFeldPipe implements PipeTransform<unknown, LohnausweisBetragFeldId> {
  transform(value: unknown): LohnausweisBetragFeldId {
    if (typeof value !== 'string' || !(LOHNAUSWEIS_BETRAG_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${LOHNAUSWEIS_BETRAG_FELDER.join(', ')}`)
    }
    return value as LohnausweisBetragFeldId
  }
}
