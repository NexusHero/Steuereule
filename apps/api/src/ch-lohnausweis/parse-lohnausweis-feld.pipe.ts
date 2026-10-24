// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/ch-lohnausweis/{feld}` against
// the 14 CHF-betrag field ids, read from the SAME runtime list the core fold iterates
// (`LOHNAUSWEIS_BETRAG_FELDER` in @steuereule/core) — one source, so the closed set (the
// Lohnausweis's printed CHF figures) cannot drift between the fold and the boundary. A wrong id
// must be a 400 at the boundary, never a Prisma column-miss deep in the repository.
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
