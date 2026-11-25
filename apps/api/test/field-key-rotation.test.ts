// Rotating the field-encryption key (ADR-0008, REQ-003): every encrypted column is rotated, derived from the
// schema annotations; values under a retired key move to the current one; nothing else is touched. The lock part
// fails when a model gains an encrypted column the rotation cannot address, or when an append-only table's
// trigger no longer lets exactly its encrypted columns change (migration 20261204090000_field_key_rotation).
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decryptStringSync, encryptStringSync, generateKey, getMessageKeyFingerprint, parseKeySync } from '@47ng/cloak'
import { Prisma } from '@prisma/client'
import { analyseDMMF } from 'prisma-field-encryption/dist/dmmf.js'
import { describe, expect, it } from 'vitest'
import { prismaRotationStore, reEncrypt, rotateFieldEncryption, rotationKeys, rotationTargets, valueState, type RotationStore, type RotationTarget } from '../src/prisma/field-key-rotation.js'

const OLD = generateKey()
const NEW = generateKey()
const UNKNOWN = generateKey()

describe('the rotation covers every encrypted column (lock)', () => {
  const targets = rotationTargets()

  it('names every field the extension encrypts, and only those', () => {
    const analysis = analyseDMMF(Prisma.dmmf as never)
    const annotated = Object.entries(analysis)
      .flatMap(([model, descriptor]) => Object.entries(descriptor.fields).filter(([, config]) => config.encrypt).map(([field]) => `${model}.${field}`))
      .sort()
    const columnOf = (model: string, field: string) => {
      const f = Prisma.dmmf.datamodel.models.find((m) => m.name === model)!.fields.find((x) => x.name === field)!
      return f.dbName ?? f.name
    }
    const covered = targets.flatMap((t) => t.columns.map((column) => ({ model: t.model, column })))
    expect(annotated.length).toBeGreaterThan(150)
    expect(covered).toHaveLength(annotated.length)
    for (const key of annotated) {
      const [model, field] = key.split('.') as [string, string]
      expect(covered, key).toContainEqual({ model, column: columnOf(model, field) })
    }
  })

  it('can address and scope the rows of every such table', () => {
    for (const target of targets) {
      expect(target.idColumn, target.model).toBeTruthy()
      expect(target.ownerColumn, target.model).toBe(target.model === 'User' ? target.idColumn : 'userId')
    }
  })

  it('every append-only trigger lets through exactly the encrypted columns of its table', () => {
    const migrations = path.join(path.dirname(fileURLToPath(import.meta.url)), '../prisma/migrations')
    const sql = readdirSync(migrations)
      .filter((entry) => entry !== 'migration_lock.toml')
      .sort()
      .map((entry) => readFileSync(path.join(migrations, entry, 'migration.sql'), 'utf8'))
      .join('\n')
    // The last definition of each row trigger on steuereule_append_only wins.
    const triggers = new Map<string, string[]>()
    for (const match of sql.matchAll(/CREATE TRIGGER "\w+" BEFORE UPDATE OR DELETE ON "(\w+)"\s+FOR EACH ROW EXECUTE FUNCTION steuereule_append_only\(([^)]*)\)/g)) {
      triggers.set(match[1]!, [...match[2]!.matchAll(/'([^']+)'/g)].map((arg) => arg[1]!).sort())
    }
    expect([...triggers.keys()].sort()).toEqual(['Buchung', 'Buchungsprotokoll', 'Buchungszeile'])
    for (const [table, columns] of triggers) {
      expect(columns, table).toEqual([...(targets.find((t) => t.table === table)?.columns ?? [])].sort())
    }
  })
})

describe('one value', () => {
  const keys = rotationKeys({ encryptionKey: NEW, decryptionKeys: [OLD] })

  it('moves a value under a retired key to the current key, with the same clear text', () => {
    const old = encryptStringSync('DE89370400440532013000', parseKeySync(OLD))
    expect(valueState(old, keys)).toBe('retired')
    const rotated = reEncrypt(old, keys)
    expect(getMessageKeyFingerprint(rotated)).toBe(parseKeySync(NEW).fingerprint)
    expect(decryptStringSync(rotated, parseKeySync(NEW))).toBe('DE89370400440532013000')
  })

  it('leaves current, clear-text, empty and unknown-key values alone', () => {
    const current = encryptStringSync('x', parseKeySync(NEW))
    const unknown = encryptStringSync('x', parseKeySync(UNKNOWN))
    expect([valueState(current, keys), valueState('Markus', keys), valueState(null, keys), valueState(unknown, keys)]).toEqual(['current', 'clear-text', 'empty', 'unknown-key'])
    expect(reEncrypt(current, keys)).toBe(current)
    expect(reEncrypt('Markus', keys)).toBe('Markus')
  })
})

/** Rows in memory, keyed by table; `write` is compare-and-set like the SQL one. */
function memoryStore(tables: Record<string, Record<string, string | null>[]>): RotationStore & { writes: number } {
  const store = {
    writes: 0,
    page: (target: RotationTarget, afterId: string | null, limit: number, ownerIds?: readonly string[]) =>
      Promise.resolve(
        (tables[target.table] ?? [])
          .filter((row) => (afterId === null || row[target.idColumn]! > afterId) && (ownerIds === undefined || ownerIds.includes(row[target.ownerColumn]!)))
          .sort((a, b) => a[target.idColumn]!.localeCompare(b[target.idColumn]!))
          .slice(0, limit)
          .map((row) => ({ ...row })),
      ),
    write: (target: RotationTarget, id: string, changes: Readonly<Record<string, { from: string; to: string }>>) => {
      const row = tables[target.table]!.find((r) => r[target.idColumn] === id)!
      if (Object.entries(changes).some(([column, change]) => row[column] !== change.from)) return Promise.resolve(false)
      for (const [column, change] of Object.entries(changes)) row[column] = change.to
      store.writes += 1
      return Promise.resolve(true)
    },
  }
  return store
}

describe('a run', () => {
  const target: RotationTarget = { model: 'Profile', table: 'Profile', idColumn: 'id', ownerColumn: 'userId', columns: ['firstName', 'steuerId'] }
  const keys = rotationKeys({ encryptionKey: NEW, decryptionKeys: [OLD] })
  const old = (text: string) => encryptStringSync(text, parseKeySync(OLD))

  it('re-encrypts every row page by page, then a check finds nothing left', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, userId: `u${i}`, firstName: old(`Name${i}`), steuerId: i % 2 === 0 ? old('02476291358') : null }))
    const store = memoryStore({ Profile: rows })

    const [count] = await rotateFieldEncryption(store, keys, { batchSize: 3 }, [target])

    expect(count).toMatchObject({ rows: 7, reEncrypted: 7, retired: 0, unknownKey: 0 })
    for (const row of rows) expect(getMessageKeyFingerprint(row.firstName)).toBe(parseKeySync(NEW).fingerprint)
    expect(decryptStringSync(rows[4]!.steuerId!, parseKeySync(NEW))).toBe('02476291358')
    const [checked] = await rotateFieldEncryption(store, keys, { check: true }, [target])
    expect(checked).toMatchObject({ rows: 7, retired: 0 })
    expect((await rotateFieldEncryption(store, keys, {}, [target]))[0]!.reEncrypted).toBe(0)
  })

  it('check writes nothing and counts what is left', async () => {
    const store = memoryStore({ Profile: [{ id: 'p1', userId: 'u1', firstName: old('A'), steuerId: old('B') }] })
    const [count] = await rotateFieldEncryption(store, keys, { check: true }, [target])
    expect(count).toMatchObject({ retired: 2, reEncrypted: 0 })
    expect(store.writes).toBe(0)
  })

  it('leaves a row with a value under an unknown key untouched and reports it', async () => {
    const unknown = encryptStringSync('C', parseKeySync(UNKNOWN))
    const rows = [{ id: 'p1', userId: 'u1', firstName: old('A'), steuerId: unknown }]
    const [count] = await rotateFieldEncryption(memoryStore({ Profile: rows }), keys, {}, [target])
    expect(count).toMatchObject({ unknownKey: 1, reEncrypted: 0 })
    expect(rows[0]!.steuerId).toBe(unknown)
  })

  it('does not overwrite a value the app rewrote during the run', async () => {
    const rows = [{ id: 'p1', userId: 'u1', firstName: old('A'), steuerId: null as string | null }]
    const store = memoryStore({ Profile: rows })
    const written = encryptStringSync('Neu', parseKeySync(NEW))
    const racing: RotationStore = {
      page: async (...args) => {
        const page = await store.page(...args)
        rows[0]!.firstName = written
        return page
      },
      write: store.write,
    }
    const [count] = await rotateFieldEncryption(racing, keys, {}, [target])
    expect(rows[0]!.firstName).toBe(written)
    expect(count).toMatchObject({ reEncrypted: 0, retired: 1 })
  })

  it('rotates only the owners it is given', async () => {
    const rows = [
      { id: 'p1', userId: 'u1', firstName: old('A'), steuerId: null },
      { id: 'p2', userId: 'u2', firstName: old('B'), steuerId: null },
    ]
    await rotateFieldEncryption(memoryStore({ Profile: rows }), keys, { ownerIds: ['u2'] }, [target])
    expect(valueState(rows[0]!.firstName, keys)).toBe('retired')
    expect(valueState(rows[1]!.firstName, keys)).toBe('current')
  })
})

describe('the SQL the store sends (no unsafe raw SQL)', () => {
  const target: RotationTarget = rotationTargets().find((t) => t.columns.length > 0)!

  function capturingClient() {
    const sent: Prisma.Sql[] = []
    const tx = {
      $queryRaw: async (sql: Prisma.Sql) => (sent.push(sql), []),
      $executeRaw: async (sql: Prisma.Sql | TemplateStringsArray) => (Array.isArray(sql) ? undefined : sent.push(sql as Prisma.Sql), 1),
    }
    const client = { $transaction: async (work: (t: typeof tx) => Promise<unknown>) => work(tx) }
    return { sent, client: client as unknown as Parameters<typeof prismaRotationStore>[0] }
  }

  it('binds every value as a parameter and names only schema identifiers', async () => {
    const { sent, client } = capturingClient()
    const store = prismaRotationStore(client)
    const hostile = "x'; DROP TABLE \"User\"; --"
    await store.page(target, hostile, 50, [hostile])
    await store.write(target, hostile, { [target.columns[0]!]: { from: hostile, to: hostile } })
    expect(sent).toHaveLength(2)
    for (const sql of sent) {
      expect(sql.sql).not.toContain('DROP TABLE')
      expect(sql.values).toContain(hostile)
    }
  })

  it('refuses a column that is not an encrypted column of the target', async () => {
    const { client } = capturingClient()
    const store = prismaRotationStore(client)
    await expect(store.write(target, 'id', { 'not_a_column"; --': { from: 'a', to: 'b' } })).rejects.toThrow(/Only encrypted columns/)
  })
})
