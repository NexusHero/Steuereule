import type { ScreenAccess } from '../common/screen-access.js'
import type { ProfileRepository } from './profile.repository.js'

export const PROFILE_ACCESS_FIELDS = ['firstName', 'lastName', 'steuerId', 'steuernummer'] as const

/** The confirmation path's view of the screen `profil` (ADR-0066). The profile is per user, not per year. */
export function profileFieldAccess(profile: ProfileRepository): ScreenAccess {
  return {
    fields: PROFILE_ACCESS_FIELDS,
    withInstance: false,
    async read(userId) {
      const p = await profile.findByUserId(userId)
      return {
        // The profile stores a missing name as '' (both are required columns): that is no value to keep.
        firstName: p?.firstName || null,
        lastName: p?.lastName || null,
        steuerId: p?.steuerId ?? null,
        steuernummer: p?.steuernummer ?? null,
      }
    },
    async write(userId, _year, _instance, field, value) {
      const current = await profile.findByUserId(userId)
      await profile.upsert(userId, {
        firstName: current?.firstName ?? '',
        lastName: current?.lastName ?? '',
        steuerId: current?.steuerId ?? null,
        steuernummer: current?.steuernummer ?? null,
        [field]: value,
      })
      return true
    },
  }
}
