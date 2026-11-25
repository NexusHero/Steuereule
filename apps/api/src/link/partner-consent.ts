import { isShadowId } from '../common/person-ids.js'
import type { PartnerCouplingRecord } from './link.repository.js'

/** Person B has an account of their own (not a shadow record kept by Person A). */
export function personBHasOwnAccount(row: Pick<PartnerCouplingRecord, 'personBUserId'>): boolean {
  return row.personBUserId !== '' && !isShadowId(row.personBUserId)
}

/**
 * Decision 3 (API-3): Person B with an own account agrees per tax year, in B's own app. Until then Person A
 * sees nothing of B for that year. A shadow B (no account) is A's own record and needs no consent.
 */
export function personBConsentPending(row: PartnerCouplingRecord): boolean {
  return row.filingType === 'zusammen' && personBHasOwnAccount(row) && (row.personBConsentedAt ?? null) === null
}

/**
 * The coupling of a year as `userId` may use it to reach the other person's data. While Person B has not agreed
 * to the year, Person A gets the joint year without B's id (`personBWithheld`), so no reader that follows
 * `personBUserId` reaches B's records. Person B always sees the row as it is: it is B's consent to give.
 *
 * Every reader of a partner's data takes the row from here (the tax-case reader does it for all of its
 * consumers); only the code that manages the coupling itself works on the stored row.
 */
export function couplingVisibleTo<Row extends PartnerCouplingRecord>(row: Row | null, userId: string): Row | null {
  if (row === null || row.personAUserId !== userId || !personBConsentPending(row)) return row
  return { ...row, personBUserId: '', personBWithheld: true }
}
