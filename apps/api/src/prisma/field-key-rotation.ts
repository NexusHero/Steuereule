import { decryptStringSync, encryptStringSync, findKeyForMessage, getMessageKeyFingerprint, parseCloakedString } from '@47ng/cloak'
import { Prisma, type PrismaClient } from '@prisma/client'
import { configureKeys, type KeysConfiguration } from 'prisma-field-encryption/dist/encryption.js'
import { analyseDMMF } from 'prisma-field-encryption/dist/dmmf.js'
import { withSystemDatabaseAccess } from '../common/database-identity.js'
import type { FieldEncryptionKeys } from './field-encryption-key.js'
import { transactionAwareClient } from './transaction.js'

// Rotating `PRISMA_FIELD_ENCRYPTION_KEY` (ADR-0008, REQ-003). The extension writes with the current key and
// reads with it and every key in `PRISMA_FIELD_DECRYPTION_KEYS`, so a new key alone re-encrypts a value only
// when the app next writes it; values nobody writes again stay under the old key, and retiring it would make
// them unreadable. This re-encrypts every value under a retired key in place.
//
// What is encrypted comes from the schema's own annotations, read by the same function the extension uses
// (`analyseDMMF` over `Prisma.dmmf`), so a column that gains `/// @encrypted` is rotated without a change
// here. `test/field-key-rotation.test.ts` locks that, and that the append-only triggers let exactly these
// columns through (`20261204090000_field_key_rotation`).
//
// The rewrite is raw SQL on the encrypted columns only: no `@updatedAt` moves, no hash companion changes (the
// clear text is the same), and the append-only tables of the book (GoBD) accept it only under
// `steuereule.reencryption`, only for their encrypted columns. The ledger's hash chain is over the clear
// text, so it stays intact.

/** One table and the encrypted columns the rotation rewrites in it. */
export interface RotationTarget {
  readonly model: string
  readonly table: string
  readonly idColumn: string
  /** The column that names the row's owner: `userId`, or the id of `User` itself. */
  readonly ownerColumn: string
  readonly columns: readonly string[]
}

type DmmfModel = (typeof Prisma.dmmf.datamodel.models)[number]

/** Every table with an encrypted column, derived from the schema annotations the extension reads. */
export function rotationTargets(dmmf: typeof Prisma.dmmf = Prisma.dmmf): RotationTarget[] {
  const analysis = analyseDMMF(dmmf as never)
  const targets: RotationTarget[] = []
  for (const model of dmmf.datamodel.models as readonly DmmfModel[]) {
    const encrypted = Object.entries(analysis[model.name]?.fields ?? {})
      .filter(([, config]) => config.encrypt)
      .map(([name]) => name)
    if (encrypted.length === 0) continue
    const column = (name: string) => {
      const field = model.fields.find((f) => f.name === name)
      if (!field) throw new Error(`${model.name}.${name} is annotated but not a field.`)
      if (field.type !== 'String' || field.isList) throw new Error(`${model.name}.${name} is encrypted but not a single String column.`)
      return field.dbName ?? field.name
    }
    const ids = model.fields.filter((f) => f.isId)
    if (ids.length !== 1 || ids[0]!.type !== 'String') throw new Error(`${model.name} has encrypted columns but no single String id to address its rows by.`)
    const idColumn = ids[0]!.dbName ?? ids[0]!.name
    const owner = model.fields.find((f) => f.name === 'userId')
    const ownerColumn = owner ? (owner.dbName ?? owner.name) : model.name === 'User' ? idColumn : undefined
    if (ownerColumn === undefined) throw new Error(`${model.name} has encrypted columns but no userId to scope a rotation by.`)
    targets.push({ model: model.name, table: model.dbName ?? model.name, idColumn, ownerColumn, columns: encrypted.map(column).sort() })
  }
  return targets.sort((a, b) => a.model.localeCompare(b.model))
}

export type ValueState = 'empty' | 'clear-text' | 'current' | 'retired' | 'unknown-key'

/** Where a stored value stands: under the current key, a retired one in the keychain, or a key nobody has. */
export function valueState(value: string | null, keys: KeysConfiguration): ValueState {
  if (value === null || value === '') return 'empty'
  if (!parseCloakedString(value)) return 'clear-text'
  const fingerprint = getMessageKeyFingerprint(value)
  if (fingerprint === keys.encryptionKey.fingerprint) return 'current'
  return keys.keychain[fingerprint] ? 'retired' : 'unknown-key'
}

/** The value under the current key; clear text, empty values and current ones come back unchanged. */
export function reEncrypt(value: string, keys: KeysConfiguration): string {
  if (valueState(value, keys) !== 'retired') return value
  return encryptStringSync(decryptStringSync(value, findKeyForMessage(value, keys.keychain)), keys.encryptionKey)
}

/** Reads a page of rows and writes re-encrypted columns back; the Prisma adapter is below. */
export interface RotationStore {
  page(target: RotationTarget, afterId: string | null, limit: number, ownerIds?: readonly string[]): Promise<Record<string, string | null>[]>
  /**
   * Writes `to` where the column still holds `from` (compare and set): a value the app rewrote meanwhile is
   * already under the current key and must not be overwritten with the older content. False when the row moved.
   */
  write(target: RotationTarget, id: string, changes: Readonly<Record<string, { from: string; to: string }>>): Promise<boolean>
}

export interface RotationCount {
  model: string
  rows: number
  reEncrypted: number
  /** Values still under a retired key: what `check` finds, or rows the app changed during the run. */
  retired: number
  /** Values no configured key can read: the run fails, nothing of such a row is written. */
  unknownKey: number
  /** Values in clear text (non-strict columns written before they were encrypted): left to their backfill. */
  clearText: number
}

export interface RotationOptions {
  /** Count only, write nothing. */
  readonly check?: boolean
  readonly batchSize?: number
  /** Only these owners' rows (user by user, as ADR-0110 step 3 needs); all rows when absent. */
  readonly ownerIds?: readonly string[]
}

export function rotationKeys(keys: FieldEncryptionKeys): KeysConfiguration {
  return configureKeys({ encryptionKey: keys.encryptionKey, decryptionKeys: keys.decryptionKeys })
}

export async function rotateFieldEncryption(store: RotationStore, keys: KeysConfiguration, options: RotationOptions = {}, targets = rotationTargets()): Promise<RotationCount[]> {
  const limit = options.batchSize ?? 500
  const counts: RotationCount[] = []
  for (const target of targets) {
    const count: RotationCount = { model: target.model, rows: 0, reEncrypted: 0, retired: 0, unknownKey: 0, clearText: 0 }
    let afterId: string | null = null
    for (;;) {
      const rows = await store.page(target, afterId, limit, options.ownerIds)
      if (rows.length === 0) break
      for (const row of rows) {
        count.rows += 1
        const id = row[target.idColumn]!
        const changed: Record<string, { from: string; to: string }> = {}
        let unreadable = false
        for (const column of target.columns) {
          const value = row[column] ?? null
          const state = valueState(value, keys)
          if (state === 'clear-text') count.clearText += 1
          if (state === 'unknown-key') {
            count.unknownKey += 1
            unreadable = true
          }
          if (state === 'retired') {
            if (options.check) count.retired += 1
            else changed[column] = { from: value!, to: reEncrypt(value!, keys) }
          }
        }
        if (!options.check && !unreadable && Object.keys(changed).length > 0) {
          if (await store.write(target, id, changed)) count.reEncrypted += 1
          else count.retired += 1
        }
      }
      afterId = rows[rows.length - 1]![target.idColumn]!
    }
    counts.push(count)
  }
  return counts
}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

/**
 * Raw SQL through a client that is NOT the encrypted one, so it sees the stored ciphertext. It crosses every user,
 * so it runs for the system reason `field-key-rotation` (row-level security, P11); a write also sets
 * `steuereule.reencryption`, which the append-only triggers honour for the encrypted columns only, and only for a
 * login other than the API's runtime role.
 */
export function prismaRotationStore(prisma: PrismaClient): RotationStore {
  const client = transactionAwareClient(prisma)
  return {
    page: (target, afterId, limit, ownerIds) =>
      withSystemDatabaseAccess('field-key-rotation', () => client.$transaction(async (tx) => {
        const params: unknown[] = []
        const where: string[] = []
        if (afterId !== null) {
          params.push(afterId)
          where.push(`${quote(target.idColumn)} > $${params.length}`)
        }
        if (ownerIds !== undefined) {
          params.push([...ownerIds])
          where.push(`${quote(target.ownerColumn)} = ANY($${params.length}::text[])`)
        }
        params.push(limit)
        const columns = [target.idColumn, ...target.columns].map(quote).join(', ')
        const sql = `SELECT ${columns} FROM ${quote(target.table)}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${quote(target.idColumn)} LIMIT $${params.length}`
        return tx.$queryRawUnsafe<Record<string, string | null>[]>(sql, ...params)
      })),
    write: async (target, id, changes) => {
      const columns = Object.keys(changes)
      if (columns.some((column) => !target.columns.includes(column))) throw new Error(`Only encrypted columns of ${target.table} are rewritten.`)
      return withSystemDatabaseAccess('field-key-rotation', () => client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('steuereule.reencryption', 'on', true)`
        const params: unknown[] = []
        const param = (value: unknown) => {
          params.push(value)
          return `$${params.length}`
        }
        const assignments = columns.map((column) => `${quote(column)} = ${param(changes[column]!.to)}`).join(', ')
        const unchanged = columns.map((column) => `${quote(column)} = ${param(changes[column]!.from)}`).join(' AND ')
        const sql = `UPDATE ${quote(target.table)} SET ${assignments} WHERE ${quote(target.idColumn)} = ${param(id)} AND ${unchanged}`
        return (await tx.$executeRawUnsafe(sql, ...params)) === 1
      }))
    },
  }
}
