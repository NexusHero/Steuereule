import type { ChildRepository } from '../children/child.repository.js'
import type { RentalRepository } from '../rental/rental.repository.js'
import type { DraftRecords } from './advisor-drafts.js'

/** The rows a draft may prepare as new (ADR-0091): a child, a rental object. Only a child is removed again on undo. */
export function draftRecordsOf(childRepo: ChildRepository, rentalRepo: RentalRepository): DraftRecords {
  return {
    create: async (dataUserId, taxYear, screen, values) => {
      if (screen === 'kind') {
        const child = await childRepo.create(dataUserId, taxYear, {
          firstName: values.firstName ?? '',
          lastName: values.lastName ?? '',
          geburtsdatum: values.geburtsdatum ?? '',
        })
        return child.id
      }
      if (screen === 'vermietung') return (await rentalRepo.create(dataUserId, taxYear)).id
      return null
    },
    remove: async (dataUserId, taxYear, screen, id) => {
      if (screen === 'kind') await childRepo.delete(dataUserId, taxYear, id)
    },
  }
}
