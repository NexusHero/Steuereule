export interface ProfileRecord {
  firstName: string
  lastName: string
  steuerId: string | null
  steuernummer: string | null
  createdAt?: Date
  updatedAt?: Date
}

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY')

/** The persistence seam for Profile. */
export interface ProfileRepository {
  findByUserId(userId: string): Promise<ProfileRecord | null>
  upsert(userId: string, data: ProfileRecord): Promise<ProfileRecord>
}
