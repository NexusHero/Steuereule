import { MIN_TAX_YEAR, maxTaxYear } from './tax-year.js'

// The ids one person's rows are kept under (ADR-0054): the account id, and one shadow id per tax year for a
// Person B kept in that account without a login of their own. Deletion, export, guest takeover
// (`personal-data/personal-data-registry.ts`) and the access log read the same set from here.

export const SHADOW_PREFIX = 'spouse_'

export function shadowIdOf(userId: string, taxYear: number): string {
  return `${SHADOW_PREFIX}${userId}_${taxYear}`
}

export function isShadowId(id: string): boolean {
  return id.startsWith(SHADOW_PREFIX)
}

/** The account a shadow id belongs to (`spouse_<userId>_<year>` → userId); any other id is its own owner. */
export function ownerOf(id: string): string {
  if (!isShadowId(id)) return id
  const rest = id.slice(SHADOW_PREFIX.length)
  const cut = rest.lastIndexOf('_')
  return cut > 0 ? rest.slice(0, cut) : rest
}

/**
 * The person's id set: the id itself and every shadow id of a Person B the person may keep (one per tax
 * year a route accepts, by the same clock as the route: `maxTaxYear`). Shadow ids are deterministic, so no row
 * has to remember them: a shadow left behind by a switch to a single return, or by B joining with an own
 * account, is still found here.
 */
export function personIds(userId: string, now = new Date()): string[] {
  if (isShadowId(userId)) return [userId]
  const ids = [userId]
  for (let year = MIN_TAX_YEAR; year <= maxTaxYear(now); year += 1) ids.push(shadowIdOf(userId, year))
  return ids
}
