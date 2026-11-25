/**
 * The field-encryption keys as resolved at boot (ADR-0008), for code that derives a key of its own from
 * them without touching the database client. PrismaModule provides them under this token.
 */
export const FIELD_ENCRYPTION_KEYS = Symbol('FIELD_ENCRYPTION_KEYS')

export interface FieldEncryptionKeySet {
  readonly encryptionKey: string
  readonly decryptionKeys: readonly string[]
}
