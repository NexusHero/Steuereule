// Validates the `:feld` path segment of `PUT /v1/steuerjahre/{jahr}/lstb/{feld}` against
// the three LStB field ids. Deliberately NOT importing the id list from @steuereule/core
// (the core exports the *type* `LstbFeldId`, not a runtime list) — the three ids are a
// closed, product-fixed set (the LStB's printed figures), and a wrong id must be a 400 at
// the boundary, never a Prisma column-miss deep in the repository.
import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import type { LstbFeldId } from '@steuereule/core'

const LSTB_FELDER: readonly LstbFeldId[] = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

@Injectable()
export class ParseLstbFeldPipe implements PipeTransform<unknown, LstbFeldId> {
  transform(value: unknown): LstbFeldId {
    if (typeof value !== 'string' || !(LSTB_FELDER as readonly string[]).includes(value)) {
      throw new BadRequestException(`feld must be one of: ${LSTB_FELDER.join(', ')}`)
    }
    return value as LstbFeldId
  }
}
