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
const withPolicy = tablesWith(/CREATE POLICY \w+ ON "([^"]+)"/g)
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

  it('the runtime role owns nothing and bypasses nothing', () => {
    expect(sql).toMatch(/CREATE ROLE steuereule_app NOLOGIN NOSUPERUSER NOBYPASSRLS/)
    expect(sql).not.toMatch(/ALTER (?:TABLE|SCHEMA) [^;]* OWNER TO steuereule_app/)
    expect(sql).not.toMatch(/ALTER ROLE steuereule_app[^;]*BYPASSRLS/)
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
    const fixtureCallers = sources.filter(({ text }) => text.includes('useTestFixtureIdentityOutsideRequests')).map(({ file }) => file)
    expect(fixtureCallers).toEqual([IDENTITY_MODULE])
  })

  it('only the Prisma layer sets the identity settings', () => {
    const setters = sources.filter(({ text }) => /steuereule\.(?:user_id|system)/.test(text)).map(({ file }) => file)
    expect(setters).toEqual([PRISMA_LAYER])
  })

  it('no source connects as another role or turns row-level security off', () => {
    for (const { file, text } of sources) {
      // database-url.ts picks the runtime role and says in its comment why that role has no BYPASSRLS.
      const code = file === 'src/config/database-url.ts' ? text.replace(/\/\*\*[\s\S]*?\*\//g, '') : text
      expect(/SET\s+(?:LOCAL\s+)?ROLE|row_security\s*=\s*off|BYPASSRLS/i.test(code), file).toBe(false)
    }
  })
})
