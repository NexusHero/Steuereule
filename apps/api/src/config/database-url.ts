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
