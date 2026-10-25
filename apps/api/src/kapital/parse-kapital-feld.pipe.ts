// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/kapital/{feld}` against
// the Kapital field id, read from the SAME runtime list the core fold iterates
// (`KAPITAL_FELDER` in @steuereule/core) — one source, so the closed set cannot drift between
// the fold and the boundary. A wrong id must be a 400 at the boundary, never a Prisma
// column-miss deep in the repo. Today the set is a single field (`kapitalertraege`), but the
// boundary is written against the list, not the literal, so a future second field (e.g. a
// separate inländische/ausländische Trennung) lands in ONE place.
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
