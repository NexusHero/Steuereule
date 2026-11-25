// The migrate job creates the API's database login (scripts/runtime-database-login.mjs). Pure parts here; the
// statements run against real roles in row-level-security.integration.test.ts.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain .mjs script of the migrate job, without type declarations
import { provisionRuntimeLogin, runtimeLoginPlan, runtimeLoginProblems, scramVerifier } from '../scripts/runtime-database-login.mjs'

const OWNER = 'postgresql://steuereule:owner-password-0123456789abcdef@localhost/steuereule?host=/cloudsql/p:r:i'
const RUNTIME = 'postgresql://steuereule_api:runtime-password-0123456789abcdef@localhost/steuereule?host=/cloudsql/p:r:i'

describe('scramVerifier', () => {
  it('derives the keys of RFC 7677 §3 (user "user", password "pencil")', () => {
    const verifier = scramVerifier('pencil', Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64'), 4096) as string
    const [, iterations, salt, storedKey, serverKey] = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(verifier)!
    expect([iterations, salt]).toEqual(['4096', 'W22ZaJ0SNY7soEsUEjb6gQ=='])
    // The RFC's exchange: the server signature is HMAC(ServerKey, AuthMessage).
    const authMessage =
      'n=user,r=rOprNGfwEbeRWgbNEkqO,' +
      'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096,' +
      'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0'
    expect(createHmac('sha256', Buffer.from(serverKey!, 'base64')).update(authMessage).digest('base64')).toBe('6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=')
    expect(Buffer.from(storedKey!, 'base64')).toHaveLength(32)
  })

  it('never contains the password and differs per call (random salt)', () => {
    const a = scramVerifier('runtime-password-0123456789abcdef') as string
    expect(a).not.toContain('runtime-password')
    expect(scramVerifier('runtime-password-0123456789abcdef')).not.toBe(a)
  })

  it('refuses a password SASLprep could change', () => {
    expect(() => scramVerifier('pässword-with-umlaut-0123456789')).toThrow(/printable ASCII/)
  })
})

describe('runtimeLoginPlan', () => {
  it('creates the login named in RUNTIME_DATABASE_URL', () => {
    const plan = runtimeLoginPlan({ NODE_ENV: 'production', DATABASE_URL: OWNER, RUNTIME_DATABASE_URL: RUNTIME })
    expect(plan).toMatchObject({ kind: 'provision', role: 'steuereule_api' })
    expect(JSON.stringify(plan)).not.toContain('runtime-password')
  })

  it('production refuses to migrate without a separate runtime login', () => {
    expect(() => runtimeLoginPlan({ NODE_ENV: 'production', DATABASE_URL: OWNER })).toThrow(/RUNTIME_DATABASE_URL must be set in production/)
    expect(() => runtimeLoginPlan({ NODE_ENV: 'production', DATABASE_URL: OWNER, RUNTIME_DATABASE_URL: OWNER })).toThrow(/same user/)
  })

  it('a development database keeps its one login', () => {
    expect(runtimeLoginPlan({ DATABASE_URL: OWNER })).toEqual({ kind: 'none' })
  })

  it.each([
    ['the app role itself', RUNTIME.replace('steuereule_api', 'steuereule_app'), /reserved/],
    ['postgres', RUNTIME.replace('steuereule_api', 'postgres'), /reserved/],
    ['a Cloud SQL system role', RUNTIME.replace('steuereule_api', 'cloudsqlsuperuser'), /reserved/],
    ['a name that would need quoting', RUNTIME.replace('steuereule_api', 'api%22%3B%20DROP'), /not a role name/],
    ['another database', RUNTIME.replace('/steuereule?', '/other?'), /different databases/],
    ['a short password in production', RUNTIME.replace('runtime-password-0123456789abcdef', 'short'), /too short/],
  ])('refuses %s', (_, runtimeUrl, expected) => {
    expect(() => runtimeLoginPlan({ NODE_ENV: 'production', DATABASE_URL: OWNER, RUNTIME_DATABASE_URL: runtimeUrl })).toThrow(expected)
  })
})

describe('provisionRuntimeLogin', () => {
  const clean = { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, member_of: ['steuereule_app'], owns: 0 }
  function client(exists: boolean, after: object) {
    const statements: string[] = []
    let reads = 0
    return {
      statements,
      $queryRaw: async () => ((reads += 1) === 1 ? (exists ? [{}] : []) : [after]),
      $executeRawUnsafe: async (sql: string) => void statements.push(sql),
    }
  }
  const plan = runtimeLoginPlan({ DATABASE_URL: OWNER, RUNTIME_DATABASE_URL: RUNTIME })

  it('creates the login without any privilege of its own and grants it the app role only', async () => {
    const db = client(false, clean)
    await provisionRuntimeLogin(db, plan)
    expect(db.statements[0]).toMatch(/^CREATE ROLE "steuereule_api" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'SCRAM-SHA-256\$/)
    expect(db.statements[1]).toBe('GRANT steuereule_app TO "steuereule_api"')
    expect(db.statements.join('\n')).not.toContain('runtime-password')
  })

  it('an existing login gets the current password', async () => {
    const db = client(true, clean)
    await provisionRuntimeLogin(db, plan)
    expect(db.statements[0]).toMatch(/^ALTER ROLE "steuereule_api" LOGIN PASSWORD 'SCRAM-SHA-256\$/)
  })

  it('fails the migrate job when the login that exists could step around the policies', async () => {
    await expect(provisionRuntimeLogin(client(true, { ...clean, member_of: ['steuereule_app', 'cloudsqlsuperuser'], rolcreaterole: true }), plan)).rejects.toThrow(/CREATEROLE; is a member of cloudsqlsuperuser/)
    await expect(provisionRuntimeLogin(client(true, { ...clean, owns: 3 }), plan)).rejects.toThrow(/owns 3/)
  })

  it('refuses input that did not come from runtimeLoginPlan', async () => {
    await expect(provisionRuntimeLogin(client(false, clean), { kind: 'provision', role: 'x"; DROP ROLE y; --', verifier: plan.verifier })).rejects.toThrow(/unexpected input/)
    await expect(provisionRuntimeLogin(client(false, clean), { kind: 'provision', role: 'steuereule_api', verifier: "x' SUPERUSER --" })).rejects.toThrow(/unexpected input/)
  })

  it('names the same problems the API checks at boot', () => {
    expect(runtimeLoginProblems(clean)).toEqual([])
    expect(runtimeLoginProblems({ ...clean, rolbypassrls: true })).toEqual(['has BYPASSRLS'])
  })
})
