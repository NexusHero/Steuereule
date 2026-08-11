// #279 — the liveness/readiness building block.
//
// UPDATED under #338 F1 (Musti's §4, measured): the readiness probe originally reused
// #275's `assertDatabaseReachable` directly. Measured on real Postgres
// (`max_connections=100`): that mapped one unauthenticated, unrated `GET` onto one new
// Postgres backend, and 80+ concurrent requests made every replica report `503 not
// ready` simultaneously against a database that was completely healthy throughout — a
// self-inflicted total outage. `HealthModule` now wires
// `createPooledDatabaseReachabilityCheck` (`pooled-database-reachability-check.ts`)
// instead: it probes through the app's own `PrismaService` connection pool (the pool
// every real request is already served from) and coalesces concurrent callers behind a
// short TTL, so N simultaneous requests cost one round trip. `assertDatabaseReachable`
// itself is untouched and still exactly what it always was — the one-shot boot-time
// guard, imported exactly once, from `main.ts`.
//
// `DATABASE_REACHABILITY_CHECK` is an injection token, not a direct import of whichever
// function implements it, for the same reason `PrismaService`/`PDF_RENDERER` are swapped
// out in `test/support/build-test-app.ts`: the plain no-DB `test` job (ADR-0004) must
// never dial a real Postgres just because a health module exists in the DI graph.
// `HealthModule` wires the real, pooled probe; `build-test-app.ts` wires a fast stub.
// This token and that override seam are unaffected by the F1 fix above — only what sits
// behind the token changed.
import { Inject, Injectable, Logger } from '@nestjs/common'

export const DATABASE_REACHABILITY_CHECK = Symbol('DATABASE_REACHABILITY_CHECK')

/** Resolves if the database is reachable, rejects (with a redacted error) if it is not — the exact shape `assertDatabaseReachable` already has. */
export type DatabaseReachabilityCheck = () => Promise<void>

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)

  constructor(
    @Inject(DATABASE_REACHABILITY_CHECK) private readonly checkDatabaseReachable: DatabaseReachabilityCheck,
  ) {}

  /**
   * Returns a bare boolean to the caller (`HealthController`) — never the underlying
   * error. The probe's own redaction already strips the DSN/credentials, but this
   * readiness probe has no auth in front of it (#279's own DoR names the disclosure
   * question; the kubelet polls it from inside the cluster, but nothing at the
   * application layer stops an external caller from reaching it too if the
   * ingress/NetworkPolicy is ever misconfigured — a deployment-layer control, not this
   * endpoint's). So even the redacted-but-still-real finding is logged HERE, server-side,
   * and goes no further than that.
   *
   * That deployment-layer control is not just a comment anymore (Musti's §4 on #338,
   * F3: a mitigation named only here is one nobody writing #292's k3s manifests will
   * ever read) — it is a tracked obligation on #292's manifests: **#344**, "Ingress must
   * not route `/v1/health/*` from the public listener; a NetworkPolicy restricts those
   * paths to the kubelet/node CIDR." This comment stays, unchanged in substance, as the
   * reasoning #344 was promoted from — not a duplicate to keep in sync by hand, the
   * source it was lifted from.
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.checkDatabaseReachable()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      this.logger.warn(`readiness probe: database unreachable — ${message}`)
      return false
    }
  }
}
