import { CAPITAL_FIELDS, type CapitalFieldId } from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { ScreenAccess } from '../common/screen-access.js'
import type { CapitalRepository } from './capital.repository.js'

export const CAPITAL_ACCESS_FIELDS = [...CAPITAL_FIELDS, 'inhaber'] as const
const CAPITAL_OWNERS = ['A', 'B', 'gemeinsam'] as const

/** The confirmation path's view of the screen `kapital` (ADR-0066): the amounts, and whose depot it is. */
export function capitalFieldAccess(capital: CapitalRepository): ScreenAccess {
  return {
    fields: CAPITAL_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const r = await capital.findForUserAndYear(userId, taxYear)
      return { ...Object.fromEntries(CAPITAL_FIELDS.map((f) => [f, r?.[f] ?? null])), inhaber: r?.inhaber ?? r?.owner ?? null }
    },
    async write(userId, taxYear, _instance, field, value) {
      if (field === 'inhaber') {
        if (!(CAPITAL_OWNERS as readonly (string | null)[]).includes(value)) {
          throw new InvalidInputError('FIELD_VALUE_INVALID', `"inhaber" must be one of: ${CAPITAL_OWNERS.join(', ')}.`)
        }
        await capital.setOwner(userId, taxYear, value as (typeof CAPITAL_OWNERS)[number])
        return true
      }
      await capital.setField(userId, taxYear, field as CapitalFieldId, value)
      return true
    },
  }
}
