export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.DATABASE_URL

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'DATABASE_URL must be set — every guest/registration/device-code path needs a database ' +
        'connection on its very first request, in every environment; unlike the guest-session ' +
        'secret or the field-encryption key there is no dev-only fallback that would actually ' +
        'work here (see apps/api/.env.example, or docker-compose.yml for the local stack’s value).',
    )
  }

  if (raw !== raw.replace(/^\s+/, '')) {
    throw new Error(
      'DATABASE_URL has leading whitespace — this value cannot connect as written. Measured against ' +
        'Prisma 6.19.3, leading whitespace fails identically on both paths (this guard’s probe and the ' +
        'connection PrismaService makes), so refusing now is the same failure you would get anyway, ' +
        'five seconds sooner and correctly labeled instead of reported as unreachable. Trailing ' +
        'whitespace — including the trailing newline `kubectl create secret --from-file` and a YAML ' +
        '`|` block append — is a different case: it works on both paths and is NOT rejected. Remove ' +
        'the LEADING whitespace at the source (your .env file or shell export).',
    )
  }

  return raw
}

/**
 * The role the API queries as (P11, migration `…_p11_row_level_security`): it owns no table and has neither
 * SUPERUSER nor BYPASSRLS, so the row-level policies bind every query of the app.
 *
 * In production `DATABASE_URL` is the runtime login, which the migrate job creates as a member of this role
 * and of nothing else (`scripts/runtime-database-login.mjs`); `assertDatabaseRole` refuses to start as any
 * other login. The switch below is then a no-op in privileges and keeps `current_user` the same everywhere.
 * Where one login serves migrations and the app (a developer's database, the test tiers) the switch is what
 * binds the policies.
 */
export const RUNTIME_DATABASE_ROLE = 'steuereule_app'

/** `DATABASE_URL` with `options=-c role=steuereule_app`, merged into any `options` the URL already carries. */
export function withRuntimeDatabaseRole(databaseUrl: string): string {
  const trimmed = databaseUrl.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return databaseUrl
  }
  const existing = parsed.searchParams.get('options')
  if (existing !== null && /(^|\s)-c\s*role=/.test(existing)) {
    throw new Error('DATABASE_URL sets a role in its options; the API chooses its role itself (P11, row-level security).')
  }
  const roleOption = `-c role=${RUNTIME_DATABASE_ROLE}`
  if (existing === null) {
    // Appended as text: re-serialising the URL would re-encode the Cloud SQL socket path and the password.
    return `${trimmed}${trimmed.includes('?') ? '&' : '?'}options=${encodeURIComponent(roleOption)}`
  }
  parsed.searchParams.set('options', existing === '' ? roleOption : `${existing} ${roleOption}`)
  return parsed.toString()
}
