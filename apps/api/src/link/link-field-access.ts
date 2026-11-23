import type { ScreenAccess } from '../common/screen-access.js'
import type { PartnerCouplingRepository } from './link.repository.js'

export const LINK_ACCESS_FIELDS = ['filingType', 'invitationCode'] as const

/**
 * Chooses the Veranlagungsart the way the Kopplung mask does (`LinkService.set`): „zusammen“
 * creates Person B's placeholder, so there is someone to record for (ADR-0054, ADR-0091).
 */
export type SetFilingType = (userId: string, taxYear: number, filingType: 'einzel' | 'zusammen') => Promise<void>

/**
 * The confirmation path's view of the screen `kopplung` (ADR-0066). With `setFilingType` the
 * Veranlagungsart goes through the link service; without it the row is written as it is.
 */
export function linkFieldAccess(link: PartnerCouplingRepository, setFilingType?: SetFilingType): ScreenAccess {
  return {
    fields: LINK_ACCESS_FIELDS,
    withInstance: false,
    async read(userId, taxYear) {
      const l = await link.findByUserAndYear(userId, taxYear)
      return {
        filingType: l?.filingType ?? null,
        invitationCode: l?.invitationCode ?? null,
      }
    },
    async write(userId, taxYear, _instance, field, value) {
      if (field === 'filingType' && setFilingType) {
        await setFilingType(userId, taxYear, value === 'zusammen' ? 'zusammen' : 'einzel')
        return true
      }
      const current = await link.findByUserAndYear(userId, taxYear)
      if (field === 'filingType') {
        const filingType = value === 'zusammen' ? 'zusammen' : 'einzel'
        await link.upsert(userId, taxYear, {
          personBUserId: current?.personBUserId ?? '',
          filingType,
          invitationCode: current?.invitationCode ?? null,
        })
        return true
      }
      if (field === 'invitationCode') {
        await link.upsert(userId, taxYear, {
          personBUserId: current?.personBUserId ?? '',
          filingType: current?.filingType ?? 'einzel',
          invitationCode: value,
        })
        return true
      }
      return false
    },
  }
}
