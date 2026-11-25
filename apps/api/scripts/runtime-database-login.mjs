// The database role model (P11, ADR-0111 "Row-level security"):
//
//   migration login   owns the schema, runs migrations, backfills and `rotate:field-key`. Only the migrate job
//                     has its password (`DATABASE_URL` of that job).
//   runtime login     what the API connects as (`DATABASE_URL` of the API, `RUNTIME_DATABASE_URL` of the migrate
//                     job). Owns nothing, no SUPERUSER / BYPASSRLS / CREATEROLE / CREATEDB, member of
//                     `steuereule_app` and of nothing else, so it cannot become the owner. Whoever holds the API's
//                     password cannot ALTER a table, drop a policy, or use the owner-only re-encryption exception
//                     of the append-only tables.
//   steuereule_app    NOLOGIN, holds the table privileges; the row-level policies bind it.
//
// The migrate job creates the runtime login from the two URLs it is given, in every environment the same way, so
// no pipeline carries a second way to make it. The password is sent as a SCRAM-SHA-256 verifier computed here:
// the clear text never appears in a statement, and therefore in no server log.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'

export const APP_ROLE = 'steuereule_app'
const SCRAM_ITERATIONS = 4096
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/
// Printable ASCII: SASLprep (RFC 4013) leaves it unchanged, so the verifier below is the one the server derives.
const PRINTABLE_ASCII = /^[!-~]+$/
const VERIFIER = /^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/
const MIN_PRODUCTION_PASSWORD_LENGTH = 24

/** `SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>` (RFC 5802 §3, the form of pg_authid.rolpassword). */
export function scramVerifier(password, salt = randomBytes(16), iterations = SCRAM_ITERATIONS) {
  if (!PRINTABLE_ASCII.test(password)) throw new Error('The runtime login password must be printable ASCII without spaces.')
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', salted).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', salted).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

function credentials(name, url) {
  let parsed
  try {
    parsed = new URL(url.trim())
  } catch {
    throw new Error(`${name} is not a URL.`)
  }
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  }
}

function isReservedRole(name) {
  return name === APP_ROLE || name === 'postgres' || name.startsWith('pg_') || name.startsWith('cloudsql')
}

/**
 * What the migrate job does about the runtime login. `none`: a development database with one login, where the API
 * still switches to `steuereule_app` per connection. `provision`: the statements' inputs. Throws for a setup that
 * would leave the API running as the owner in production, or that names a role this script must never touch.
 */
export function runtimeLoginPlan(env) {
  const ownerUrl = env.DATABASE_URL?.trim()
  const runtimeUrl = env.RUNTIME_DATABASE_URL?.trim()
  const production = env.NODE_ENV === 'production'
  if (!ownerUrl) throw new Error('DATABASE_URL is not set.')
  if (!runtimeUrl) {
    if (production) {
      throw new Error(
        'RUNTIME_DATABASE_URL must be set in production: the URL the API connects with. The migrate job creates that login ' +
          '(no ownership, no BYPASSRLS), so the API never runs as the owner of the tables (P11, infra/README.md).',
      )
    }
    return { kind: 'none' }
  }
  const owner = credentials('DATABASE_URL', ownerUrl)
  const runtime = credentials('RUNTIME_DATABASE_URL', runtimeUrl)
  if (!ROLE_NAME.test(runtime.user)) {
    throw new Error(`RUNTIME_DATABASE_URL: "${runtime.user}" is not a role name this script creates (lower case letters, digits, _).`)
  }
  if (runtime.user === owner.user) {
    throw new Error('RUNTIME_DATABASE_URL names the same user as DATABASE_URL: the API would run as the owner of the tables.')
  }
  if (isReservedRole(runtime.user)) throw new Error(`RUNTIME_DATABASE_URL: "${runtime.user}" is a reserved role.`)
  if (runtime.database !== owner.database) throw new Error('RUNTIME_DATABASE_URL and DATABASE_URL name different databases.')
  if (runtime.password.length < (production ? MIN_PRODUCTION_PASSWORD_LENGTH : 1)) {
    throw new Error('RUNTIME_DATABASE_URL: the password is too short.')
  }
  return { kind: 'provision', role: runtime.user, verifier: scramVerifier(runtime.password) }
}

const FORBIDDEN_ATTRIBUTES = [
  ['rolsuper', 'SUPERUSER'],
  ['rolbypassrls', 'BYPASSRLS'],
  ['rolcreaterole', 'CREATEROLE'],
  ['rolcreatedb', 'CREATEDB'],
  ['rolreplication', 'REPLICATION'],
]

/** What must hold for the runtime login; the API checks the same at boot (src/config/assert-database-role.ts). */
export function runtimeLoginProblems(row) {
  const problems = []
  for (const [attribute, label] of FORBIDDEN_ATTRIBUTES) {
    if (row[attribute]) problems.push(`has ${label}`)
  }
  const foreign = row.member_of.filter((name) => name !== APP_ROLE)
  if (foreign.length > 0) problems.push(`is a member of ${foreign.join(', ')}`)
  if (!row.member_of.includes(APP_ROLE)) problems.push(`is not a member of ${APP_ROLE}`)
  if (row.owns > 0) problems.push(`owns ${row.owns} object(s)`)
  return problems
}

/**
 * Creates or updates the runtime login as the migration login and proves the result. `client` is a Prisma client
 * connected with the migration login. The role name passed ROLE_NAME and the verifier is base64 plus `$` and `:`,
 * so both are safe to place in a utility statement (which takes no bind parameters).
 */
export async function provisionRuntimeLogin(client, plan) {
  if (plan.kind !== 'provision') return
  const { role, verifier } = plan
  if (!ROLE_NAME.test(role) || isReservedRole(role) || !VERIFIER.test(verifier)) {
    throw new Error('Refusing to build a role statement from unexpected input.')
  }
  const existing = await client.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname = ${role}`
  if (existing.length === 0) {
    await client.$executeRawUnsafe(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${verifier}'`,
    )
  } else {
    // Attributes are not changed here (a non-superuser owner may not touch some of them); they are checked below.
    await client.$executeRawUnsafe(`ALTER ROLE "${role}" LOGIN PASSWORD '${verifier}'`)
  }
  await client.$executeRawUnsafe(`GRANT ${APP_ROLE} TO "${role}"`)
  const rows = await client.$queryRaw`
    SELECT r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb, r.rolreplication,
           -- Every role the login can reach through membership, not only the direct grants (as the API's boot check).
           ARRAY(SELECT g.rolname::text FROM pg_roles g WHERE g.oid <> r.oid AND pg_has_role(r.oid, g.oid, 'MEMBER') ORDER BY g.rolname) AS member_of,
           ((SELECT count(*) FROM pg_class c WHERE c.relowner = r.oid)
             + (SELECT count(*) FROM pg_proc p WHERE p.proowner = r.oid)
             + (SELECT count(*) FROM pg_namespace n WHERE n.nspowner = r.oid)
             + (SELECT count(*) FROM pg_database d WHERE d.datdba = r.oid))::int AS owns
      FROM pg_roles r WHERE r.rolname = ${role}`
  const problems = rows.length === 1 ? runtimeLoginProblems(rows[0]) : ['does not exist']
  if (problems.length > 0) {
    throw new Error(`The runtime login "${role}" ${problems.join('; ')}. Fix the role by hand; the API refuses to start as it.`)
  }
}
