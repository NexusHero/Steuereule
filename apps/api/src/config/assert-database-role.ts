import { PrismaClient } from '@prisma/client'
import { RUNTIME_DATABASE_ROLE, resolveDatabaseUrl } from './database-url.js'
import { disconnectQuietly, redactCause, withTimeout } from './assert-database-reachable.js'

const PROBE_TIMEOUT_MS = 5_000

/**
 * The login the API connects with, as the database describes it. Row-level security (P11) holds only against a
 * login that cannot step around it: one that owns the tables can drop a policy or disable the feature, a
 * SUPERUSER or BYPASSRLS role is never bound, and a member of such a role becomes it with `SET ROLE`.
 */
export interface DatabaseLoginFacts {
  readonly login: string
  readonly rolsuper: boolean
  readonly rolbypassrls: boolean
  readonly rolcreaterole: boolean
  readonly rolcreatedb: boolean
  readonly rolreplication: boolean
  /** Every role the login is a member of, directly or through another role. */
  readonly member_of: readonly string[]
  /** Tables, sequences, functions and schemas owned by the login or by a role it is a member of. */
  readonly owns: number
  /** Whether the login may create objects in the schemas the app's tables and policy functions live in. */
  readonly creates_in_schema: boolean
}

const FORBIDDEN_ATTRIBUTES: readonly (readonly [keyof DatabaseLoginFacts, string])[] = [
  ['rolsuper', 'SUPERUSER'],
  ['rolbypassrls', 'BYPASSRLS'],
  ['rolcreaterole', 'CREATEROLE'],
  ['rolcreatedb', 'CREATEDB'],
  ['rolreplication', 'REPLICATION'],
]

/** Why this login must not serve requests; empty when it is the runtime login the migrate job creates. */
export function databaseLoginProblems(facts: DatabaseLoginFacts): string[] {
  const problems: string[] = []
  for (const [attribute, label] of FORBIDDEN_ATTRIBUTES) {
    if (facts[attribute] === true) problems.push(`has ${label}`)
  }
  const foreign = facts.member_of.filter((name) => name !== RUNTIME_DATABASE_ROLE)
  if (foreign.length > 0) problems.push(`is a member of ${foreign.join(', ')} and can become it with SET ROLE`)
  if (!facts.member_of.includes(RUNTIME_DATABASE_ROLE)) problems.push(`is not a member of ${RUNTIME_DATABASE_ROLE}`)
  if (facts.owns > 0) problems.push(`owns ${facts.owns} table(s), function(s) or schema(s)`)
  if (facts.creates_in_schema) problems.push('may create objects in the schema public or app_rls')
  return problems
}

export interface DatabaseRoleClient {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  $disconnect(): Promise<void>
}

export interface AssertDatabaseRoleOptions {
  env?: NodeJS.ProcessEnv
  createClient?: (databaseUrl: string) => DatabaseRoleClient
}

/**
 * Boot guard, production only: refuses to start when `DATABASE_URL` is not the runtime login (the owner of the
 * tables, a superuser, a role that can become one). Outside production one login serves migrations and the app
 * (a developer's database, the test tiers); there the per-connection switch to `steuereule_app` binds the
 * policies, and nobody but the developer holds the password.
 */
export async function assertDatabaseRole(options: AssertDatabaseRoleOptions = {}): Promise<void> {
  const env = options.env ?? process.env
  if (env.NODE_ENV !== 'production') return
  const createClient = options.createClient ?? ((url: string): DatabaseRoleClient => new PrismaClient({ datasources: { db: { url } } }))
  const client = createClient(resolveDatabaseUrl(env))
  let rows: DatabaseLoginFacts[]
  try {
    rows = await withTimeout(
      client.$queryRaw<DatabaseLoginFacts[]>`
        WITH reachable AS (
          SELECT r.oid, r.rolname FROM pg_roles r WHERE r.rolname <> session_user AND pg_has_role(session_user, r.oid, 'MEMBER')
        ), identities AS (
          SELECT oid FROM reachable UNION ALL SELECT oid FROM pg_roles WHERE rolname = session_user
        )
        SELECT session_user::text AS login, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
               ARRAY(SELECT rolname::text FROM reachable ORDER BY rolname) AS member_of,
               ((SELECT count(*) FROM pg_class c WHERE c.relowner IN (SELECT oid FROM identities))
                 + (SELECT count(*) FROM pg_proc p WHERE p.proowner IN (SELECT oid FROM identities))
                 + (SELECT count(*) FROM pg_namespace n WHERE n.nspowner IN (SELECT oid FROM identities)))::int AS owns,
               (has_schema_privilege(session_user, 'public', 'CREATE') OR has_schema_privilege(session_user, 'app_rls', 'CREATE')) AS creates_in_schema
          FROM pg_roles r WHERE r.rolname = session_user`,
      PROBE_TIMEOUT_MS,
    )
  } catch (rawCause) {
    // oxlint-disable-next-line eslint/preserve-caught-error
    throw new Error('Cannot read which role DATABASE_URL connects as — refusing to start.', { cause: redactCause(rawCause) })
  } finally {
    await disconnectQuietly(client)
  }
  const facts = rows[0]
  const problems = facts ? databaseLoginProblems(facts) : ['is unknown to pg_roles']
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: the database login "${facts?.login ?? '?'}" of DATABASE_URL ${problems.join('; ')}. ` +
        'The API must connect as the runtime login the migrate job creates from RUNTIME_DATABASE_URL; the owner of the ' +
        'tables belongs to the migrate job only (row-level security, P11; infra/README.md, "Database users").',
    )
  }
}
