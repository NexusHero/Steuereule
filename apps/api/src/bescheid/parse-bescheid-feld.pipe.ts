// Boundary validation for the `:feld` path param of the Bescheid endpoints — the closed set of
// BescheidFeld ids lives in @steuereule/core (BESCHEID_FELD_IDS), never hand-copied here, so an
// unknown field id is rejected at the boundary (400) rather than reaching the service (ADR-0033's
// one-rule instinct, same as ParseLohnausweisFeldPipe).
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import { BESCHEID_FELD_IDS, type BescheidFeld } from '@steuereule/core'

@Injectable()
export class ParseBescheidFeldPipe implements PipeTransform<string, BescheidFeld> {
  transform(value: string): BescheidFeld {
    if (!(BESCHEID_FELD_IDS as readonly string[]).includes(value)) {
      throw new BadRequestException(`unknown Bescheid field "${value}"`)
    }
    return value as BescheidFeld
  }
}
