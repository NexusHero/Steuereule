// #289 — the usability finding: a reachable but unmigrated database must refuse boot.
// Fake clients pin the decision table deterministically; the fail-closed and
// cleanup-cannot-replace-the-finding clauses are part of the acceptance criterion.
import { describe, expect, it } from 'vitest'
import {
  assertDatabaseMigrated,
  findMissingMigrations,
  listExpectedMigrations,
  type MigrationRecordClient,
} from '../../src/config/assert-database-migrated.js'

const env = { DATABASE_URL: 'postgresql://someuser:super-secret-pw@db.internal:5432/steuereule' }

function clientReturning(
  rows: Promise<{ migration_name: string }[]>,
  disconnect: () => Promise<void> = () => Promise.resolve(),
): MigrationRecordClient {
  return {
    $queryRaw: <T>() => rows as Promise<T>,
    $disconnect: disconnect,
  }
}

describe('findMissingMigrations', () => {
  it('names every expected migration that is not applied, in expected order', () => {
    expect(findMissingMigrations(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('ignores applied migrations this build does not know (an older image against a newer schema is expand-only safe)', () => {
    expect(findMissingMigrations(['a'], ['a', 'z'])).toEqual([])
  })
})

describe('listExpectedMigrations', () => {
  it('reads the migration directories this build ships, sorted, without the lock file', () => {
    const names = listExpectedMigrations()
    expect(names[0]).toBe('20260723000000_init')
    expect(names).not.toContain('migration_lock.toml')
    expect([...names].sort()).toEqual(names)
  })
})

describe('assertDatabaseMigrated', () => {
  it('starts when every expected migration is applied', async () => {
    const rows = Promise.resolve([{ migration_name: 'a' }, { migration_name: 'b' }])
    await expect(
      assertDatabaseMigrated({ env, expected: ['a', 'b'], createClient: () => clientReturning(rows) }),
    ).resolves.toBeUndefined()
  })

  it('refuses an empty-but-reachable schema, naming the missing migrations', async () => {
    const rows = Promise.resolve([{ migration_name: 'a' }])
    await expect(
      assertDatabaseMigrated({ env, expected: ['a', 'b', 'c'], createClient: () => clientReturning(rows) }),
    ).rejects.toThrow(/not migrated: 2 migration\(s\).*\(b, c\)/)
  })

  it('refuses (never passes) when the migration record itself cannot be read, with a redacted cause', async () => {
    const failing = Promise.reject(new Error('relation "_prisma_migrations" does not exist (user=someuser)'))
    const error = await assertDatabaseMigrated({
      env,
      expected: ['a'],
      createClient: () => clientReturning(failing),
    }).catch((caught: unknown) => caught as Error)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(/Cannot read the applied-migration record/)
    expect(String((error.cause as Error).message)).not.toMatch(/someuser/)
    expect(error.message).not.toMatch(/super-secret-pw|someuser/)
  })

  it('a rejecting $disconnect cannot replace the finding', async () => {
    const rows = Promise.resolve([] as { migration_name: string }[])
    const client = clientReturning(rows, () => Promise.reject(new Error('password=super-secret-pw')))
    await expect(assertDatabaseMigrated({ env, expected: ['a'], createClient: () => client })).rejects.toThrow(
      /not migrated/,
    )
  })

  it('control proof: with nothing missing the same fake client passes — the refusal comes from the record, not the fake', async () => {
    const rows = Promise.resolve([{ migration_name: 'a' }])
    await expect(
      assertDatabaseMigrated({ env, expected: ['a'], createClient: () => clientReturning(rows) }),
    ).resolves.toBeUndefined()
  })
})
