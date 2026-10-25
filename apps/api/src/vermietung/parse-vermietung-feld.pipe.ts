// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/vermietung/objekte/
// {objektId}/{feld}` against the Vermietung field ids, read from the SAME runtime list the core
// fold iterates (`VERMIETUNG_FELDER` in @steuereule/core) — one source, so the closed set cannot
// drift between the fold and the boundary. A wrong id must be a 400 at the boundary, never a
// Prisma column-miss deep in the repo.
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
