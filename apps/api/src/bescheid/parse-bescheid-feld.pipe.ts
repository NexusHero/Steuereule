import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { BESCHEID_FELD_IDS, type BescheidFeld } from '@steuereule/core'

/** Boundary validation for the `:feld` path param of the Bescheid endpoints. */
@Injectable()
export class ParseBescheidFeldPipe implements PipeTransform<string, BescheidFeld> {
  transform(value: string): BescheidFeld {
    if (!(BESCHEID_FELD_IDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`unknown Bescheid field "${value}"`)
    }
    return value as BescheidFeld
  }
}
