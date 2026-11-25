// P11 (finding H2-10): tenant isolation in Postgres itself. Raw SQL through the API's runtime role
// (`steuereule_app`, the role every PrismaService connection switches to) with user A's identity setting cannot
// read or change user B's rows; without a setting it sees nothing; the system setting passes; the partner and
// Person B shadow rules let through exactly the coupled rows. Runs against the migrated CI Postgres.
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAsDatabaseUser, withSystemDatabaseAccess } from '../src/common/database-identity.js'
import { RUNTIME_DATABASE_ROLE, withRuntimeDatabaseRole } from '../src/config/database-url.js'
import { transactionAwareClient } from '../src/prisma/transaction.js'

const NO_PERSONAL_DATA = new Set(['OauthResource', 'OauthClientResource', 'OauthClientAssertion', 'Jwks'])

const url = process.env.DATABASE_URL!
const owner = new PrismaClient()
const runtime = new PrismaClient({ datasources: { db: { url: withRuntimeDatabaseRole(url) } } })

const run = randomUUID().slice(0, 8)
const A = `rls-a-${run}`
const B = `rls-b-${run}`
const C = `rls-c-${run}`
const shadowOfA = `spouse_${A}_2025`
const lookalike = `spouse_${A}_x_2025`

/** One transaction of the runtime role with the given settings, as the API sends it. */
async function as<T>(settings: { userId?: string; system?: string }, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return runtime.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('steuereule.user_id', ${settings.userId ?? ''}, true), set_config('steuereule.system', ${settings.system ?? ''}, true)`
    return work(tx)
  })
}

const ownersSeen = async (tx: Prisma.TransactionClient) =>
  (await tx.$queryRaw<{ userId: string }[]>`SELECT "userId" FROM "Profile" WHERE "userId" LIKE ${`%${run}%`} ORDER BY "userId"`).map((row) => row.userId)

beforeAll(async () => {
  await owner.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
    for (const userId of [A, B, C, shadowOfA, lookalike]) {
      await tx.$executeRaw`INSERT INTO "Profile" ("id", "userId", "firstName", "lastName", "updatedAt") VALUES (${randomUUID()}, ${userId}, 'x', 'y', now())`
    }
    // C's years 2025 and 2026: the per-year rule lets B reach only the year C agreed to.
    for (const year of [2025, 2026]) {
      await tx.$executeRaw`INSERT INTO "TaxYear" ("id", "userId", "steuerjahr", "baseEstimate", "openItems", "updatedAt") VALUES (${randomUUID()}, ${C}, ${year}, 0, 0, now())`
    }
    // B and C file jointly (C has an own account); A files alone.
    await tx.$executeRaw`INSERT INTO "SteuerjahrKopplung" ("id", "personAUserId", "personBUserId", "steuerjahr", "veranlagungsart", "updatedAt") VALUES (${randomUUID()}, ${B}, ${C}, 2025, 'zusammen', now())`
  })
})

afterAll(async () => {
  await owner.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
    await tx.$executeRaw`DELETE FROM "Profile" WHERE "userId" LIKE ${`%${run}%`}`
    await tx.$executeRaw`DELETE FROM "TaxYear" WHERE "userId" LIKE ${`%${run}%`}`
    await tx.$executeRaw`DELETE FROM "SteuerjahrKopplung" WHERE "personAUserId" LIKE ${`%${run}%`}`
    await tx.$executeRaw`DELETE FROM "TaxDataAccessLog" WHERE "userId" LIKE ${`%${run}%`}`
  })
  await Promise.all([owner.$disconnect(), runtime.$disconnect()])
})

describe('the runtime role', () => {
  it('is the role the API queries as: no superuser, no BYPASSRLS, owner of nothing', async () => {
    const [role] = await runtime.$queryRaw<{ current: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT current_user::text AS current, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`
    expect(role).toEqual({ current: RUNTIME_DATABASE_ROLE, rolsuper: false, rolbypassrls: false })
    const owned = await runtime.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_tables WHERE tableowner = ${RUNTIME_DATABASE_ROLE}`
    expect(Number(owned[0]!.n)).toBe(0)
  })

  it('every table with personal data is ENABLEd and FORCEd, as the lock test reads it from the migrations', async () => {
    const tables = await owner.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`
    const byName = new Map(tables.map((table) => [table.relname, table]))
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = byName.get(model.dbName ?? model.name)
      expect(table, model.name).toBeDefined()
      const expected = !NO_PERSONAL_DATA.has(model.name)
      expect({ model: model.name, enabled: table!.relrowsecurity, forced: table!.relforcerowsecurity }).toEqual({ model: model.name, enabled: expected, forced: expected })
    }
  })
})

describe('user A against user B, through raw SQL', () => {
  it("A reads A's rows and A's Person B shadow rows, never B's, never a look-alike id", async () => {
    expect(await as({ userId: A }, ownersSeen)).toEqual([shadowOfA].concat(A).sort())
  })

  it("A cannot change or delete B's rows: the statements touch nothing", async () => {
    const changed = await as({ userId: A }, (tx) => tx.$executeRaw`UPDATE "Profile" SET "firstName" = 'taken' WHERE "userId" = ${B}`)
    const deleted = await as({ userId: A }, (tx) => tx.$executeRaw`DELETE FROM "Profile" WHERE "userId" = ${B}`)
    expect([changed, deleted]).toEqual([0, 0])
    expect(await as({ system: 'test-fixture' }, async (tx) => (await tx.profile.findFirst({ where: { userId: B } }))?.firstName)).toBe('x')
  })

  it('A cannot write a row in B\'s name, nor move an own row to B', async () => {
    await expect(
      as({ userId: A }, (tx) => tx.$executeRaw`INSERT INTO "Profile" ("id", "userId", "firstName", "lastName", "updatedAt") VALUES (${randomUUID()}, ${B}, 'x', 'y', now())`),
    ).rejects.toThrow(/row-level security/)
    await expect(as({ userId: A }, (tx) => tx.$executeRaw`UPDATE "Profile" SET "userId" = ${B} WHERE "userId" = ${A}`)).rejects.toThrow(/row-level security/)
  })

  // API-3 (decision 3, P6): Person B (C here) reaches A's household through the joint year; Person A (B here)
  // reaches B's rows only once B agreed to a joint year in B's own app. An uncoupled user (A) sees neither.
  it('coupled partners: Person B reaches Person A at once, Person A reaches Person B only after B agreed; an uncoupled user does neither', async () => {
    const consent = (at: Date | null) =>
      owner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
        await tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBZustimmungAm" = ${at} WHERE "personAUserId" = ${B} AND "personBUserId" = ${C}`
      })

    await consent(null)
    expect(await as({ userId: C }, ownersSeen)).toEqual([B, C].sort())
    expect(await as({ userId: B }, ownersSeen)).toEqual([B])

    await consent(new Date())
    expect(await as({ userId: C }, ownersSeen)).toEqual([B, C].sort())
    expect(await as({ userId: B }, ownersSeen)).toEqual([B, C].sort())
    expect(await as({ userId: A }, ownersSeen)).not.toContain(B)
    expect(await as({ userId: A }, ownersSeen)).not.toContain(C)
  })

  // Decision 3 per year: B agreed to the joint year 2025 only. A table with a tax year shows Person A (B here)
  // Person B's (C's) row of 2025 and not of 2026; a withdrawal takes it away from the next statement on.
  it('Person A reaches Person B only in the year B agreed to, and no longer after B withdrew', async () => {
    const consent = (at: Date | null) =>
      owner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
        await tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBZustimmungAm" = ${at} WHERE "personAUserId" = ${B} AND "personBUserId" = ${C}`
      })
    const yearsOfC = (tx: Prisma.TransactionClient) =>
      tx.$queryRaw<{ steuerjahr: number }[]>`SELECT "steuerjahr" FROM "TaxYear" WHERE "userId" = ${C} ORDER BY "steuerjahr"`.then((rows) => rows.map((row) => row.steuerjahr))

    await consent(new Date())
    expect(await as({ userId: B }, yearsOfC)).toEqual([2025])
    expect(await as({ userId: C }, yearsOfC)).toEqual([2025, 2026])
    const written = await as({ userId: B }, (tx) => tx.$executeRaw`UPDATE "TaxYear" SET "openItems" = 9 WHERE "userId" = ${C} AND "steuerjahr" = 2026`)
    expect(written).toBe(0)

    await consent(null)
    expect(await as({ userId: B }, yearsOfC)).toEqual([])
    expect(await as({ userId: C }, yearsOfC)).toEqual([2025, 2026])
  })
})

describe("a READ row in the partner's own access trail", () => {
  // B is Person A of the joint year with C. A read of C's data by B writes a READ row marked `partner` into C's trail.
  const append = (writer: string, trailOwner: string, action: 'READ' | 'WRITE', source: string | null) =>
    as({ userId: writer }, (tx) =>
      tx.$executeRaw`INSERT INTO "TaxDataAccessLog" ("id", "userId", "action", "resource", "source") VALUES (${randomUUID()}, ${trailOwner}, ${action}::"AuditAction", 'lstb', ${source})`,
    )
  const consent = (at: Date | null) =>
    owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
      await tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBZustimmungAm" = ${at} WHERE "personAUserId" = ${B} AND "personBUserId" = ${C}`
    })

  it('is allowed for a coupled partner after the consent, as READ marked partner, and nothing else', async () => {
    await consent(new Date())
    await expect(append(B, C, 'READ', 'partner')).resolves.toBe(1)
    // Person B (C) reaches Person A (B) without a consent of its own.
    await expect(append(C, B, 'READ', 'partner')).resolves.toBe(1)
    await expect(append(B, C, 'WRITE', 'partner')).rejects.toThrow(/row-level security/)
    await expect(append(B, C, 'READ', null)).rejects.toThrow(/row-level security/)
    await expect(append(B, C, 'READ', 'assistent:x')).rejects.toThrow(/row-level security/)
    // An uncoupled user writes into nobody's trail.
    await expect(append(A, C, 'READ', 'partner')).rejects.toThrow(/row-level security/)
  })

  it('is refused while Person B has not agreed', async () => {
    await consent(null)
    await expect(append(B, C, 'READ', 'partner')).rejects.toThrow(/row-level security/)
  })
})

describe('fail closed', () => {
  it('without a setting the runtime role sees nothing and writes nothing', async () => {
    expect(await runtime.profile.count({ where: { userId: { contains: run } } })).toBe(0)
    await expect(
      runtime.$executeRaw`INSERT INTO "Profile" ("id", "userId", "firstName", "lastName", "updatedAt") VALUES (${randomUUID()}, ${A}, 'x', 'y', now())`,
    ).rejects.toThrow(/row-level security/)
  })

  it('a transaction-local identity is gone after its transaction, also on the same connection', async () => {
    const single = new PrismaClient({ datasources: { db: { url: `${withRuntimeDatabaseRole(url)}&connection_limit=1` } } })
    try {
      await single.$transaction([single.$executeRaw`SELECT set_config('steuereule.user_id', ${A}, true)`, single.profile.count()])
      expect(await single.profile.count({ where: { userId: A } })).toBe(0)
    } finally {
      await single.$disconnect()
    }
  })
})

describe('the system setting', () => {
  it('passes the policies for every owner', async () => {
    expect(await as({ system: 'account-deletion' }, ownersSeen)).toEqual([A, B, C, shadowOfA, lookalike].sort())
  })
})

describe('who becomes Person B (coupling guard)', () => {
  const D = `rls-d-${run}`
  afterAll(async () => {
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
      await tx.$executeRaw`DELETE FROM "SteuerjahrKopplung" WHERE "personAUserId" = ${A}`
      await tx.$executeRaw`DELETE FROM "PartnerVerknuepfung" WHERE "personANutzerId" = ${A}`
    })
  })

  it('Person A cannot name another account as Person B, nor give B\'s consent; B and a system path can', async () => {
    const insertAs = (settings: { userId?: string; system?: string }, b: string) =>
      as(settings, (tx) => tx.$executeRaw`INSERT INTO "SteuerjahrKopplung" ("id", "personAUserId", "personBUserId", "steuerjahr", "veranlagungsart", "updatedAt") VALUES (${randomUUID()}, ${A}, ${b}, 2027, 'zusammen', now())`)
    await expect(insertAs({ userId: A }, D)).rejects.toThrow(/only Person B or a named system path/)
    // A shadow Person B is A's own record.
    await expect(insertAs({ userId: A }, shadowOfA.replace('2025', '2027'))).resolves.toBe(1)
    await expect(as({ userId: A }, (tx) => tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBUserId" = ${D} WHERE "personAUserId" = ${A} AND "steuerjahr" = 2027`)).rejects.toThrow(/only Person B or a named system path/)
    await expect(as({ system: 'partner-invitation' }, (tx) => tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBUserId" = ${D} WHERE "personAUserId" = ${A} AND "steuerjahr" = 2027`)).resolves.toBe(1)
    await expect(as({ userId: A }, (tx) => tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBZustimmungAm" = now() WHERE "personAUserId" = ${A} AND "steuerjahr" = 2027`)).rejects.toThrow(/only Person B gives or withdraws/)
    await expect(as({ userId: D }, (tx) => tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBZustimmungAm" = now() WHERE "personAUserId" = ${A} AND "steuerjahr" = 2027`)).resolves.toBe(1)
    // A may still end the joint return: B leaves the row.
    await expect(as({ userId: A }, (tx) => tx.$executeRaw`UPDATE "SteuerjahrKopplung" SET "personBUserId" = '', "personBZustimmungAm" = NULL, "veranlagungsart" = 'einzel' WHERE "personAUserId" = ${A} AND "steuerjahr" = 2027`)).resolves.toBe(1)
    await expect(as({ userId: A }, (tx) => tx.$executeRaw`INSERT INTO "PartnerVerknuepfung" ("id", "personANutzerId", "personBNutzerId", "gueltigAb", "updatedAt") VALUES (${randomUUID()}, ${A}, ${D}, 2027, now())`)).rejects.toThrow(/only Person B or a named system path/)
  })
})

describe('erasing the book (erasure grant)', () => {
  const holdId = randomUUID()
  afterAll(async () => {
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
      await tx.$executeRaw`DELETE FROM "LegalHold" WHERE "id" = ${holdId}`
    })
  })

  it('only the database function writes a grant, bound to this transaction, and never under a tax-data hold', async () => {
    await expect(as({ system: 'account-deletion' }, (tx) => tx.$executeRaw`INSERT INTO app_rls.erasure_grant (txid, owner_ids) VALUES (txid_current(), ARRAY[${A}])`)).rejects.toThrow(/permission denied/)
    const granted = await as({ system: 'account-deletion' }, async (tx) => {
      await tx.$executeRaw`SELECT app_rls.allow_erasure(ARRAY[${A}]::text[])`
      return tx.$queryRaw<{ ok: boolean }[]>`SELECT app_rls.erasure_granted(${A}) AS ok, app_rls.erasure_granted(${B}) AS other`
    })
    expect(granted).toEqual([{ ok: true, other: false }])
    // Another transaction has no grant.
    expect(await as({ system: 'account-deletion' }, (tx) => tx.$queryRaw<{ ok: boolean }[]>`SELECT app_rls.erasure_granted(${A}) AS ok`)).toEqual([{ ok: false }])
    // The session setting no longer opens anything.
    expect(await as({ system: 'account-deletion' }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.erasure', 'on', true)`
      return tx.$queryRaw<{ ok: boolean }[]>`SELECT app_rls.erasure_granted(${A}) AS ok`
    })).toEqual([{ ok: false }])
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.system', 'test-fixture', true)`
      await tx.$executeRaw`INSERT INTO "LegalHold" ("id", "userId", "resource", "holdUntil") VALUES (${holdId}, ${A}, 'taxData', now() + interval '1 year')`
    })
    await expect(as({ system: 'account-deletion' }, (tx) => tx.$executeRaw`SELECT app_rls.allow_erasure(ARRAY[${A}]::text[])`)).rejects.toThrow(/legal hold/)
  })
})

describe("the API's client against Postgres", () => {
  const client = transactionAwareClient(runtime)

  it('runs a query as the identity of its context: the user, or a named system path', async () => {
    const forA = await runAsDatabaseUser(A, () => client.profile.findMany({ where: { userId: { contains: run } }, select: { userId: true } }))
    expect(forA.map((row) => row.userId).sort()).toEqual([A, shadowOfA].sort())
    const forSystem = await withSystemDatabaseAccess('account-deletion', () => client.profile.count({ where: { userId: { contains: run } } }))
    expect(forSystem).toBe(5)
  })

  it("an interactive transaction of A cannot reach B's row", async () => {
    const seen = await runAsDatabaseUser(A, () => client.$transaction(async (tx) => tx.profile.findFirst({ where: { userId: B } })))
    expect(seen).toBeNull()
  })
})

// The role model: the API's own login, as the migrate job creates it, against the real roles of this database.
describe('the runtime login', () => {
  const role = `rls_api_${run}`
  const password = `runtime-${randomUUID()}`
  const loginUrl = (() => {
    const parsed = new URL(url)
    parsed.username = role
    parsed.password = password
    return parsed.toString()
  })()
  let login: PrismaClient

  beforeAll(async () => {
    // @ts-expect-error — a plain .mjs script of the migrate job, without type declarations
    const { provisionRuntimeLogin, runtimeLoginPlan } = await import('../scripts/runtime-database-login.mjs')
    await provisionRuntimeLogin(owner, runtimeLoginPlan({ DATABASE_URL: url, RUNTIME_DATABASE_URL: loginUrl }))
    login = new PrismaClient({ datasources: { db: { url: withRuntimeDatabaseRole(loginUrl) } } })
  })

  afterAll(async () => {
    await login.$disconnect()
    await owner.$executeRawUnsafe(`DROP ROLE IF EXISTS "${role}"`)
  })

  it('passes the boot check, and the login of the migrations does not', async () => {
    const { assertDatabaseRole } = await import('../src/config/assert-database-role.js')
    await expect(assertDatabaseRole({ env: { NODE_ENV: 'production', DATABASE_URL: loginUrl } })).resolves.toBeUndefined()
    await expect(assertDatabaseRole({ env: { NODE_ENV: 'production', DATABASE_URL: url } })).rejects.toThrow(/Refusing to start/)
  })

  it('works under the policies like the app role: its own rows with an identity, nothing without', async () => {
    expect(await login.profile.count({ where: { userId: { contains: run } } })).toBe(0)
    const seen = await login.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('steuereule.user_id', ${A}, true)`
      return ownersSeen(tx)
    })
    expect(seen).toEqual([A, shadowOfA].sort())
  })

  it('cannot step around the policies, with or without the role option in its URL', async () => {
    const bare = new PrismaClient({ datasources: { db: { url: loginUrl } } })
    try {
      for (const client of [login, bare]) {
        await expect(client.$executeRawUnsafe('ALTER TABLE "Profile" DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner/)
        await expect(client.$executeRawUnsafe('DROP POLICY p11_owner ON "Profile"')).rejects.toThrow(/must be owner/)
        await expect(client.$executeRawUnsafe('CREATE OR REPLACE FUNCTION app_rls.is_system() RETURNS boolean LANGUAGE sql AS $fn$ SELECT true $fn$')).rejects.toThrow(/must be owner|permission denied/)
        await expect(client.$executeRawUnsafe('CREATE TABLE public.rls_probe (id int)')).rejects.toThrow(/permission denied/)
        const [me] = await owner.$queryRaw<{ name: string }[]>`SELECT session_user::text AS name`
        await expect(client.$executeRawUnsafe(`SET ROLE "${me!.name}"`)).rejects.toThrow(/permission denied/)
        expect(await client.profile.count({ where: { userId: { contains: run } } })).toBe(0)
      }
    } finally {
      await bare.$disconnect()
    }
  })

  it('is not the party the append-only tables let re-encrypt; the owner of the tables is', async () => {
    const mayReencrypt = Prisma.sql`SELECT pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.relname = 'Buchung' AND c.relnamespace = 'public'::regnamespace), 'USAGE') AS allowed`
    expect(await login.$queryRaw<{ allowed: boolean }[]>(mayReencrypt)).toEqual([{ allowed: false }])
    expect(await runtime.$queryRaw<{ allowed: boolean }[]>(mayReencrypt)).toEqual([{ allowed: false }])
    expect(await owner.$queryRaw<{ allowed: boolean }[]>(mayReencrypt)).toEqual([{ allowed: true }])
    const [fn] = await owner.$queryRaw<{ src: string }[]>`SELECT prosrc AS src FROM pg_proc WHERE proname = 'steuereule_append_only'`
    expect(fn!.src).toContain("pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = TG_RELID), 'USAGE')")
    expect(fn!.src).not.toContain("current_user <> 'steuereule_app'")
  })
})
