import type { ScreenAccess } from '../confirmation/field-access.js'
import { OWN_FIRST_BUSINESS, type BusinessRef } from './business.repository.js'
import { BOOKING_ACCESS_FIELDS } from '../confirmation/field-access.js'
import type { BusinessService } from './business.service.js'

export const BOOKING_FIELD_ACCESS = Symbol('BUCHUNG_FELDZUGRIFF')

/**
 * The business a draft belongs to, from its instance (ADR-0101 §22): `b<n>.` before the reference names a
 * further business; without it, the first. Drafts made before several businesses keep their meaning.
 */
export function businessOfInstance(instance: string): BusinessRef {
  const match = /^b(\d{1,2})\./.exec(instance)
  const business = match ? Number(match[1]) : 1
  return business > 1 ? { person: 'A', business } : OWN_FIRST_BUSINESS
}

/** The instance of a draft for a business: unchanged for the first, prefixed for a further one. */
export function instanceForBusiness(business: number, reference: string): string {
  return business > 1 ? `b${business}.${reference}` : reference
}

/**
 * The confirmation path's view of a booking draft (ADR-0066 Zero-Write, ADR-0101 §18): the instance is
 * the draft's own reference. Reading gives the accepted draft while its entry stands; writing the draft
 * posts the journal entry, writing null (the draft's undo) posts its Storno — nothing is ever edited.
 */
export function bookingFieldAccess(service: Pick<BusinessService, 'acceptedDraft' | 'applyDraft'>): ScreenAccess {
  return {
    fields: BOOKING_ACCESS_FIELDS,
    withInstance: true,
    read: async (userId, taxYear, instance) => (instance === null ? null : { entry: await service.acceptedDraft(userId, taxYear, businessOfInstance(instance), instance) }),
    write: async (userId, taxYear, instance, field, value) => {
      if (instance === null || field !== 'entry') return false
      await service.applyDraft(userId, taxYear, businessOfInstance(instance), instance, value)
      return true
    },
  }
}
