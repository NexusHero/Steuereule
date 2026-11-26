// P11: the API refuses to start in production as a login that could step around row-level security: the
// owner of the tables, a superuser, a BYPASSRLS role, or a member of one. The decision table is pinned with
// fake clients; the real roles run in row-level-security.integration.test.ts.
import { describe, expect, it } from 'vitest'
import { assertDatabaseRole, databaseLoginProblems, type DatabaseLoginFacts, type DatabaseRoleClient } from '../../src/config/assert-database-role.js'

const runtime: DatabaseLoginFacts = {
  login: 'steuereule_api',
  rolsuper: false,
  rolbypassrls: false,
  rolcreaterole: false,
  rolcreatedb: false,
  rolreplication: false,
  member_of: ['steuereule_app'],
  owns: 0,
  creates_in_schema: false,
}
const production = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://steuereule_api:super-secret-pw@db.internal:5432/steuereule' }

function clientReturning(rows: Promise<DatabaseLoginFacts[]>, onDisconnect: () => void = () => undefined): DatabaseRoleClient {
  return { $queryRaw: <T>() => rows as Promise<T>, $disconnect: async () => onDisconnect() }
}

describe('databaseLoginProblems', () => {
  it('accepts the runtime login: member of steuereule_app only, owner of nothing', () => {
    expect(databaseLoginProblems(runtime)).toEqual([])
  })

  it.each<[string, Partial<DatabaseLoginFacts>, RegExp]>([
    ['the owner of the tables', { owns: 61 }, /owns 61/],
    ['a superuser', { rolsuper: true }, /SUPERUSER/],
    ['a role that bypasses row-level security', { rolbypassrls: true }, /BYPASSRLS/],
    ['a role that can create roles (and grant itself the owner)', { rolcreaterole: true }, /CREATEROLE/],
    ['a role that can create databases', { rolcreatedb: true }, /CREATEDB/],
    ['a replication role', { rolreplication: true }, /REPLICATION/],
    ['a member of the owner, who becomes it with SET ROLE', { member_of: ['steuereule_app', 'steuereule_owner'] }, /member of steuereule_owner/],
    ['a Cloud SQL user created with gcloud', { member_of: ['cloudsqlsuperuser', 'steuereule_app'], rolcreaterole: true, rolcreatedb: true }, /cloudsqlsuperuser/],
    ['a login that was never granted the app role', { member_of: [] }, /not a member of steuereule_app/],
    ['a login that may create objects next to the tables', { creates_in_schema: true }, /may create objects/],
  ])('refuses %s', (_, change, expected) => {
    expect(databaseLoginProblems({ ...runtime, ...change }).join('; ')).toMatch(expected)
  })
})

describe('assertDatabaseRole', () => {
  it('passes for the runtime login and closes its connection', async () => {
    let closed = false
    await expect(assertDatabaseRole({ env: production, createClient: () => clientReturning(Promise.resolve([runtime]), () => (closed = true)) })).resolves.toBeUndefined()
    expect(closed).toBe(true)
  })

  it('refuses to start as the owner, names the login and the reason, and never the password', async () => {
    const owner = { ...runtime, login: 'steuereule', owns: 61, rolcreaterole: true }
    const attempt = assertDatabaseRole({ env: production, createClient: () => clientReturning(Promise.resolve([owner])) })
    await expect(attempt).rejects.toThrow(/Refusing to start: the database login "steuereule" .*CREATEROLE.*owns 61/)
    await expect(attempt).rejects.not.toThrow(/super-secret-pw/)
  })

  it('fails closed when the role cannot be read', async () => {
    await expect(assertDatabaseRole({ env: production, createClient: () => clientReturning(Promise.reject(new Error('permission denied'))) })).rejects.toThrow(/refusing to start/)
    await expect(assertDatabaseRole({ env: production, createClient: () => clientReturning(Promise.resolve([])) })).rejects.toThrow(/Refusing to start/)
  })

  it('does not ask outside production, where one login serves migrations and the app', async () => {
    const never = () => {
      throw new Error('must not connect')
    }
    await expect(assertDatabaseRole({ env: { NODE_ENV: 'development', DATABASE_URL: production.DATABASE_URL }, createClient: never })).resolves.toBeUndefined()
  })
})

describe('the keystore login on the tax-data server', () => {
  const keystoreOn = (host: string) => ({ ...production, KEYSTORE_DATABASE_URL: `postgresql://steuereule_keystore_api:pw@${host}:5432/steuereule_keystore` })
  const sequence = (...answers: unknown[][]) => {
    const queue = [...answers]
    return (): DatabaseRoleClient => ({ $queryRaw: <T>() => Promise.resolve(queue.shift() as T), $disconnect: async () => undefined })
  }
  const keystoreFacts = (change: Record<string, unknown> = {}) => ({ login: 'steuereule_keystore_api', rolsuper: false, rolbypassrls: false, rolcreaterole: false, reaches_tax_data_owner: false, ...change })

  it('accepts a keystore login of its own', async () => {
    await expect(assertDatabaseRole({ env: keystoreOn('db.internal'), createClient: sequence([runtime], [keystoreFacts()]) })).resolves.toBeUndefined()
  })

  it.each([
    ['the server superuser', { rolsuper: true }, /SUPERUSER/],
    ['the owner of the tax-data tables', { reaches_tax_data_owner: true }, /owner/],
    ['a role that can create roles', { rolcreaterole: true }, /CREATEROLE/],
  ])('refuses %s', async (_, change, expected) => {
    await expect(assertDatabaseRole({ env: keystoreOn('db.internal'), createClient: sequence([runtime], [keystoreFacts(change)]) })).rejects.toThrow(expected)
  })

  it('does not probe a keystore on a server of its own (Cloud SQL)', async () => {
    let clients = 0
    const createClient = () => {
      clients++
      return clientReturning(Promise.resolve([runtime]))
    }
    await expect(assertDatabaseRole({ env: keystoreOn('keystore.internal'), createClient })).resolves.toBeUndefined()
    expect(clients).toBe(1)
  })
})
