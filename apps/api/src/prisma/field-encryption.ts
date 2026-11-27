import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { SCHEMA_MODEL } from './schema-model.js'

type ExtensionConfig = NonNullable<Parameters<typeof fieldEncryptionExtension>[0]>

/**
 * The field encryption extension for this schema. The one place that builds it: without `dmmf` the extension
 * reads `Prisma.dmmf`, which under Prisma 7 has no field documentation, finds no `@encrypted` annotation and
 * would write every sensitive column in plaintext without an error.
 */
export function schemaFieldEncryption(config: Omit<ExtensionConfig, 'dmmf'>) {
  return fieldEncryptionExtension({ ...config, dmmf: SCHEMA_MODEL as unknown as NonNullable<ExtensionConfig['dmmf']> })
}
