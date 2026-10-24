// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/lstb/{feld}` against
// the three LStB field ids, read from the SAME runtime list the core fold iterates
// (`LSTB_FELDER` in @steuereule/core) — one source, so the closed, product-fixed set (the
// LStB's printed figures) cannot drift between the fold and the boundary. A wrong id must be
// a 400 at the boundary, never a Prisma column-miss deep in the repository.
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
