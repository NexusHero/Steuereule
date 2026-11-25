// P11 lock (finding H2-10): every Prisma model's table is ENABLEd and FORCEd for row-level security with a policy
// in the migrations, or is listed below as holding no personal data, with the reason. A model another package
// adds without a policy goes red here. The second half lists every place that bypasses the policies, so a new
// bypass is a visible line in review, and checks that only the Prisma layer sets the identity.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma } from '@prisma/client'
import { Prisma as KeystorePrisma } from '@prisma-keystore/client'
import { describe, expect, it } from 'vitest'
import { PERSONAL_DATA_REGISTRY } from '../src/personal-data/personal-data-registry.js'
import { SYSTEM_DATABASE_REASONS } from '../src/common/database-identity.js'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(apiRoot, 'prisma', 'migrations')

/** Tables without a policy, each with the reason. Nothing here may hold data about a person. */
const NO_PERSONAL_DATA: Readonly<Record<string, string>> = {
  OauthResource: 'the MCP resource server entries, seeded configuration (registry: no personal data)',
  OauthClientResource: 'which client may ask for which resource; configuration (registry: no personal data)',
  OauthClientAssertion: 'replay guard of client assertions: a JWT id and its expiry (registry: no personal data)',
  Jwks: "better-auth's signing keys, encrypted (registry: no personal data)",
}

/**
 * The keystore lives in its own database (ADR-0059) with its own login. It is reached only by `KeystoreService`
 * with an explicit subject id; it gets no policies in this package (residual, see the P11 report).
 */
const KEYSTORE_RESIDUAL = ['UserDataKey']

const sql = readdirSync(migrationsDir)
  .filter((entry) => statSync(path.join(migrationsDir, entry)).isDirectory())
  .sort()
  .map((entry) => readFileSync(path.join(migrationsDir, entry, 'migration.sql'), 'utf8'))
  .join('\n')

const tablesWith = (pattern: RegExp): Set<string> => new Set([...sql.matchAll(pattern)].map((match) => match[1]!))
const enabled = tablesWith(/ALTER TABLE "([^"]+)" ENABLE ROW LEVEL SECURITY/g)
const forced = tablesWith(/ALTER TABLE "([^"]+)" FORCE ROW LEVEL SECURITY/g)
/** Replays CREATE and DROP POLICY in migration order: a table has a policy if one created is still in place. */
function tablesWithPolicy(migrationSql: string): Set<string> {
  const policies = new Map<string, Set<string>>()
  for (const match of migrationSql.matchAll(/(CREATE|DROP) POLICY (?:IF EXISTS )?(\w+) ON "([^"]+)"/g)) {
    const [, verb, policy, table] = match as unknown as [string, string, string, string]
    const current = policies.get(table) ?? new Set<string>()
    if (verb === 'CREATE') current.add(policy)
    else current.delete(policy)
    policies.set(table, current)
  }
  return new Set([...policies].filter(([, names]) => names.size > 0).map(([table]) => table))
}
const withPolicy = tablesWithPolicy(sql)

/** The policy statements in place on each table after every migration ran: table → statement text. */
function policiesInPlace(migrationSql: string): Map<string, string[]> {
  const byTable = new Map<string, Map<string, string>>()
  for (const match of migrationSql.matchAll(/(CREATE|DROP) POLICY (?:IF EXISTS )?(\w+) ON "([^"]+)"[^;]*;/g)) {
    const [statement, verb, policy, table] = match as unknown as [string, string, string, string]
    const current = byTable.get(table) ?? new Map<string, string>()
    if (verb === 'CREATE') current.set(policy, statement)
    else current.delete(policy)
    byTable.set(table, current)
  }
  return new Map([...byTable].map(([table, policies]) => [table, [...policies.values()]]))
}
const disabled = tablesWith(/ALTER TABLE "([^"]+)" (?:DISABLE|NO FORCE) ROW LEVEL SECURITY/g)

const models = Prisma.dmmf.datamodel.models.map((model) => ({ name: model.name, table: model.dbName ?? model.name }))

describe('row-level security covers every table with personal data', () => {
  it.each(models)('$name ($table) has a forced policy or is listed as holding no personal data', ({ name, table }) => {
    if (name in NO_PERSONAL_DATA) {
      expect(withPolicy.has(table), `${name} is listed as without personal data but has a policy: drop it from the list`).toBe(false)
      return
    }
    const missing = [!enabled.has(table) && 'ENABLE', !forced.has(table) && 'FORCE', !withPolicy.has(table) && 'CREATE POLICY'].filter(Boolean)
    expect(
      missing,
      `${name} ("${table}") lacks ${missing.join(', ')} ROW LEVEL SECURITY in prisma/migrations. Add a policy (see …_p11_row_level_security) or, if it holds no personal data, list it in NO_PERSONAL_DATA with the reason.`,
    ).toEqual([])
    expect(disabled.has(table), `${name}: a later migration turns its row-level security off again`).toBe(false)
  })

  it('lists only models that exist, and none the personal-data registry calls personal', () => {
    const names = models.map((model) => model.name)
    for (const name of Object.keys(NO_PERSONAL_DATA)) {
      expect(names, `${name} is not a model any more: strike it`).toContain(name)
      const entry = PERSONAL_DATA_REGISTRY.find((candidate) => candidate.model === name)
      expect(entry?.personalData, `${name} holds personal data per personal-data-registry.ts`).toBe(false)
    }
  })

  it('names every keystore model as a residual', () => {
    expect(KeystorePrisma.dmmf.datamodel.models.map((model) => model.name).sort()).toEqual([...KEYSTORE_RESIDUAL].sort())
  })

  // Decision 3 (API-3): Person A reaches Person B's rows of a year only when B agreed to that year. A table whose
  // rows carry a tax year and are owned through "userId" asks for the agreed year, not for "some agreed year".
  it('a table with a tax year lets Person A reach Person B only for the years B agreed to', () => {
    const inPlace = policiesInPlace(sql)
    const yearTables = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => (field.dbName ?? field.name) === 'steuerjahr') && model.fields.some((field) => field.name === 'userId'))
      .map((model) => model.dbName ?? model.name)
    expect(yearTables.length).toBeGreaterThan(20)
    const offenders = yearTables.filter((table) => (inPlace.get(table) ?? []).some((statement) => statement.includes('visible_owners()') || !statement.includes('agreed_partner_years()')))
    expect(offenders, 'use the condition of 20261206090000_review_partner_consent_per_year').toEqual([])
  })

  it('no policy lets every row through', () => {
    expect(sql).not.toMatch(/(?:USING|WITH CHECK)\s*\(\s*true\s*\)/i)
  })

  it('a policy dropped by a later migration no longer counts; one replaced does', () => {
    expect([...tablesWithPolicy('CREATE POLICY a ON "T" USING (x); DROP POLICY IF EXISTS a ON "T";')]).toEqual([])
    expect([...tablesWithPolicy('CREATE POLICY a ON "T" USING (x); DROP POLICY a ON "T"; CREATE POLICY b ON "T" USING (y);')]).toEqual(['T'])
  })

  it('the runtime role owns nothing and bypasses nothing', () => {
    expect(sql).toMatch(/CREATE ROLE steuereule_app NOLOGIN NOSUPERUSER NOBYPASSRLS/)
    expect(sql).not.toMatch(/ALTER (?:TABLE|SCHEMA) [^;]* OWNER TO steuereule_app/)
    expect(sql).not.toMatch(/ALTER ROLE steuereule_app[^;]*BYPASSRLS/)
  })
})

describe('row-level security lock: the role model', () => {
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'))

  it('the append-only exception for re-encryption asks who owns the table, never for a role name', () => {
    const definitions = migrations.flatMap((text) => [...text.matchAll(/CREATE OR REPLACE FUNCTION steuereule_append_only\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/g)].map((match) => match[0]))
    const current = definitions.at(-1) ?? ''
    expect(current).toContain("pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'USAGE')")
    expect(current).not.toMatch(/current_user\s*(?:<>|!=|=)\s*'/)
    expect(current).not.toMatch(/SECURITY DEFINER/)
  })

  it('no migration hands the app role or PUBLIC ownership, CREATE on a schema, or a way around the policies', () => {
    const all = migrations.join('\n')
    expect(all).toMatch(/REVOKE CREATE ON SCHEMA public FROM PUBLIC;/)
    expect(all).not.toMatch(/GRANT (?:ALL|CREATE)[^;]* ON SCHEMA [^;]* TO (?:steuereule_app|PUBLIC)/i)
    expect(all).not.toMatch(/OWNER TO steuereule_app/)
    expect(all).not.toMatch(/SECURITY DEFINER/i)
    expect(all).not.toMatch(/NO FORCE ROW LEVEL SECURITY|DISABLE ROW LEVEL SECURITY/)
    expect(all).not.toMatch(/(?:CREATE|ALTER) ROLE [^;]*\bLOGIN\b/)
  })
})

/** Every bypass of the policies in `src`: file → the reasons it uses. A new one is added here on purpose. */
const BYPASS_SITES: Readonly<Record<string, readonly string[]>> = {
  'src/auth/auth.module.ts': ['better-auth'],
  'src/auth/bearer-token.repository.prisma.ts': ['bearer-token'],
  'src/auth/step-up-grant.repository.prisma.ts': ['step-up-grant'],
  'src/auth/guest-account-upgrade.prisma.ts': ['guest-takeover'],
  'src/guest/guest-activity.repository.prisma.ts': ['guest-activity'],
  'src/guest/guest-retention.ts': ['lifecycle-sweeps'],
  'src/account/account-deletion.repository.prisma.ts': ['account-deletion'],
  'src/link/link.service.ts': ['partner-invitation'],
  'src/device/device-code.repository.prisma.ts': ['device-flow'],
  'src/unlock/unlock.service.ts': ['payment-webhook'],
  'src/prisma/field-key-rotation.ts': ['field-key-rotation'],
  'src/advisor/advisor.repository.prisma.ts': ['model-usage-stats'],
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') && !full.endsWith('.spec.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

const sources = sourceFiles(path.join(apiRoot, 'src')).map((file) => ({ file: path.relative(apiRoot, file), text: readFileSync(file, 'utf8') }))
const IDENTITY_MODULE = 'src/common/database-identity.ts'
const PRISMA_LAYER = 'src/prisma/transaction.ts'

describe('every bypass of the row-level policies is listed', () => {
  const found: Record<string, string[]> = {}
  for (const { file, text } of sources) {
    if (file === IDENTITY_MODULE) continue
    const reasons = [...text.matchAll(/(?:withSystemDatabaseAccess|systemDatabaseClient)\([^'"]*['"]([a-z-]+)['"]/g)].map((match) => match[1]!)
    if (reasons.length > 0) found[file] = [...new Set(reasons)].sort()
  }

  it('the call sites in src are exactly the listed ones', () => {
    const expected = Object.fromEntries(Object.entries(BYPASS_SITES).map(([file, reasons]) => [file, [...reasons].sort()]))
    expect(found).toEqual(expected)
  })

  it('every call names a reason literally (no computed reasons)', () => {
    for (const { file, text } of sources) {
      if (file === IDENTITY_MODULE) continue
      const calls = text.match(/(?:withSystemDatabaseAccess|systemDatabaseClient)\(/g)?.length ?? 0
      const literal = text.match(/(?:withSystemDatabaseAccess|systemDatabaseClient)\([^'"()]*['"][a-z-]+['"]/g)?.length ?? 0
      expect(literal, `${file}: a bypass without a literal reason`).toBe(calls)
    }
  })

  it('every reason is used, and the test-fixture reason only by the test tier', () => {
    const used = new Set(Object.values(found).flat())
    for (const reason of Object.keys(SYSTEM_DATABASE_REASONS)) {
      if (reason === 'test-fixture') expect(used.has(reason)).toBe(false)
      else expect(used.has(reason), `reason ${reason} is unused: strike it`).toBe(true)
    }
  })

  it('nothing in src runs a query as test-fixture or without a request by default', () => {
    // The identity comes from a request, a named system path, or nothing (no rows). No module-level fallback.
    const identity = readFileSync(path.join(apiRoot, IDENTITY_MODULE), 'utf8')
    expect(identity).toMatch(/return identityStore\.getStore\(\)\n/)
    expect(identity).not.toMatch(/process\.env\.VITEST|let \w+: DatabaseIdentity/)
    for (const { file, text } of sources) {
      if (file !== IDENTITY_MODULE) expect(text, file).not.toMatch(/['"]test-fixture['"]/)
    }
  })

  it('only the Prisma layer sets the identity settings', () => {
    const setters = sources.filter(({ text }) => /steuereule\.(?:user_id|system)/.test(text)).map(({ file }) => file)
    expect(setters).toEqual([PRISMA_LAYER])
  })

  it('no source connects as another role or turns row-level security off', () => {
    for (const { file, text } of sources) {
      // database-url.ts picks the runtime role and says in its comment why that role has no BYPASSRLS.
      const code = file === 'src/config/database-url.ts' ? text.replace(/\/\*\*[\s\S]*?\*\//g, '') : text
      if (file === 'src/config/assert-database-role.ts') {
        // The boot check reads these attributes of its own login in order to refuse them; it changes nothing.
        expect(/\$executeRaw|\$queryRawUnsafe|row_security\s*=\s*off/.test(text), file).toBe(false)
        continue
      }
      expect(/SET\s+(?:LOCAL\s+)?ROLE|row_security\s*=\s*off|BYPASSRLS/i.test(code), file).toBe(false)
    }
  })
})
