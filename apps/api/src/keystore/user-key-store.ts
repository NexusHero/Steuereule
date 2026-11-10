/** One wrapped data encryption key per user (ADR-0059). */
export interface WrappedUserKey {
  readonly wrappedDek: string
  readonly keyVersion: number
}

/**
 * Seam to the keystore database. Kept apart from the tax-data database on purpose:
 * `destroy` is the crypto-shredding step of Art. 17 DSGVO account deletion.
 */
export interface UserKeyStore {
  find(userId: string): Promise<WrappedUserKey | null>
  /** Stores `candidate` unless a key already exists; returns the key that is in force. */
  createIfAbsent(userId: string, candidate: WrappedUserKey): Promise<WrappedUserKey>
  destroy(userId: string): Promise<boolean>
}

export const USER_KEY_STORE = Symbol('USER_KEY_STORE')
