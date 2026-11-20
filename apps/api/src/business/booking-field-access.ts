import type { ScreenAccess } from '../confirmation/field-access.js'
import { BOOKING_ACCESS_FIELDS } from '../confirmation/field-access.js'
import type { BusinessService } from './business.service.js'

export const BOOKING_FIELD_ACCESS = Symbol('BUCHUNG_FELDZUGRIFF')

/**
 * The confirmation path's view of a booking draft (ADR-0066 Zero-Write, ADR-0101 §18): the instance is
 * the draft's own reference. Reading gives the accepted draft while its entry stands; writing the draft
 * posts the journal entry, writing null (the draft's undo) posts its Storno — nothing is ever edited.
 */
export function bookingFieldAccess(service: Pick<BusinessService, 'acceptedDraft' | 'applyDraft'>): ScreenAccess {
  return {
    fields: BOOKING_ACCESS_FIELDS,
    withInstance: true,
    read: async (userId, taxYear, instance) => (instance === null ? null : { entry: await service.acceptedDraft(userId, taxYear, 'A', instance) }),
    write: async (userId, taxYear, instance, field, value) => {
      if (instance === null || field !== 'entry') return false
      await service.applyDraft(userId, taxYear, 'A', instance, value)
      return true
    },
  }
}
