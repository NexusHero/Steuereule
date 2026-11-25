import { MIN_TAX_YEAR, maxTaxYear } from './tax-year.js'

/**
 * The id of a Person B kept in A's account without an own login (ADR-0054): `spouse_<userId>_<year>`.
 * The coupling writes it, and deletion, export, takeover, the read audit and the household read it; all of
 * them take the format from here, so a row written under a shadow id is always found again.
 */
const SHADOW_PREFIX = 'spouse_'

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
 * year a route accepts). Shadow ids are deterministic, so no row has to remember them: a shadow left behind
 * by a switch to a single return, or by B joining with an own account, is still found here.
 */
export function personIds(userId: string, now = new Date()): string[] {
  if (isShadowId(userId)) return [userId]
  const ids = [userId]
  for (let year = MIN_TAX_YEAR; year <= maxTaxYear(now); year += 1) ids.push(shadowIdOf(userId, year))
  return ids
}
