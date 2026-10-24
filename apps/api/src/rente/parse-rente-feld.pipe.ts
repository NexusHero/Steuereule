// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/rente/{feld}` against the
// three Rentner field ids, read from the SAME runtime list the core fold iterates (`RENTEN_FELDER`
// in @steuereule/core) — one source, so the closed set cannot drift between the fold and the
// boundary. A wrong id must be a 400 at the boundary, never a Prisma column-miss deep in the repo.
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
