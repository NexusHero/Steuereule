import type { RedisOptions } from 'ioredis'

/**
 * Connection options both Redis clients share (ADR-0109). `rediss://` turns TLS on by itself; Memorystore
 * signs with a private CA that no system trust store holds, so its PEM comes in `REDIS_TLS_CA` (a `\n`
 * written out as two characters is accepted, as env files and secret stores often flatten newlines).
 */
export function redisTlsOptions(env: NodeJS.ProcessEnv = process.env): Pick<RedisOptions, 'tls'> {
  const ca = env.REDIS_TLS_CA?.trim()
  if (!ca) return {}
  return { tls: { ca: ca.replace(/\\n/g, '\n') } }
}
