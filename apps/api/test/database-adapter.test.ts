import { describe, expect, it } from 'vitest'
import { createDatabaseAdapter, parseDatabaseUrl } from '../src/common/database-adapter.js'

// Prisma 6 read the pool settings from the connection URL. Under Prisma 7 the `pg` pool behind the driver adapter
// is configured in code; these tests pin that a URL means what it meant before.
describe('pool settings from a database URL', () => {
  it('keeps a URL without parameters and applies the Prisma 6 defaults', () => {
    expect(parseDatabaseUrl('postgresql://app:secret@db:5432/tax', 4)).toEqual({
      connectionString: 'postgresql://app:secret@db:5432/tax',
      max: 9,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 300_000,
    })
  })

  it('turns connection_limit into the pool size and removes it from the string pg reads', () => {
    const settings = parseDatabaseUrl('postgresql://app:secret@db/tax?connection_limit=3&sslmode=require', 8)
    expect(settings.max).toBe(3)
    expect(settings.connectionString).toBe('postgresql://app:secret@db/tax?sslmode=require')
  })

  it('takes the longer of pool_timeout and connect_timeout, since pg has one timeout for both', () => {
    expect(parseDatabaseUrl('postgresql://db/tax?pool_timeout=5&connect_timeout=30').connectionTimeoutMillis).toBe(30_000)
    expect(parseDatabaseUrl('postgresql://db/tax?pool_timeout=20&connect_timeout=5').connectionTimeoutMillis).toBe(20_000)
  })

  it('passes the schema to the adapter and the connection lifetimes to the pool', () => {
    const settings = parseDatabaseUrl('postgresql://db/tax?schema=keystore&max_connection_lifetime=600&max_idle_connection_lifetime=60')
    expect(settings).toMatchObject({ schema: 'keystore', maxLifetimeSeconds: 600, idleTimeoutMillis: 60_000, connectionString: 'postgresql://db/tax' })
  })

  it('leaves a Cloud SQL socket path and the session options byte for byte', () => {
    const url = 'postgresql://app:p%40ss@localhost/tax?host=/cloudsql/project:region:instance&options=-c%20role%3Dapp_runtime&connection_limit=5'
    expect(parseDatabaseUrl(url).connectionString).toBe('postgresql://app:p%40ss@localhost/tax?host=/cloudsql/project:region:instance&options=-c%20role%3Dapp_runtime')
  })

  it('ignores a pool size that is not a positive number', () => {
    expect(parseDatabaseUrl('postgresql://db/tax?connection_limit=0', 2).max).toBe(5)
    expect(parseDatabaseUrl('postgresql://db/tax?connection_limit=abc', 2).max).toBe(5)
  })

  it('refuses to build an adapter without a URL', () => {
    expect(() => createDatabaseAdapter('')).toThrow('DATABASE_URL must be set.')
    expect(() => createDatabaseAdapter('   ')).toThrow('DATABASE_URL must be set.')
  })
})
