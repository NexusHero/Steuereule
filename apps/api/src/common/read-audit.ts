import { isShadowId } from './person-ids.js'

/** The one method of AuditService a read needs; structural, so common/ stays free of the audit module. */
interface AuditTrail {
  append(entry: { userId: string; action: 'READ'; resource: string; source?: string }): Promise<void>
}

/** The other person of a joint return, as the coupling names them; null without a joint return. */
export function jointPartnerOf(
  coupling: { readonly filingType: string; readonly personAUserId: string; readonly personBUserId: string } | null | undefined,
  userId: string,
): string | null {
  if (!coupling || coupling.filingType !== 'zusammen' || !coupling.personBUserId) return null
  return coupling.personAUserId === userId ? coupling.personBUserId : coupling.personAUserId
}

/**
 * One READ row of the tax-data access trail (DSGVO Art. 15) for a read of `callerId`. The row is the
 * caller's, so the caller's own export shows it also when the data read was Person B's. A Person B with
 * an own account gets a row of their own, marked `source: 'partner'`; a shadow Person B (`spouse_…`)
 * has no login and no export, so the caller's row stands for both.
 */
export async function appendReadAudit(
  audit: AuditTrail | undefined,
  callerId: string,
  resource: string,
  otherPersons: readonly (string | null | undefined)[] = [],
): Promise<void> {
  if (!audit) return
  await audit.append({ userId: callerId, action: 'READ', resource })
  const accounts = new Set(otherPersons.filter((id): id is string => !!id && id !== callerId && !isShadowId(id)))
  // Person B's row lands in B's own trail. The access-log policy allows exactly this cross-user write: a READ row
  // marked `partner` for a partner the coupling joins (consent included), and nothing else.
  for (const userId of accounts) await audit.append({ userId, action: 'READ', resource, source: 'partner' })
}
