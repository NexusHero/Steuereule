// #279 — the liveness/readiness building block. Reuses #275's `assertDatabaseReachable`
// for the readiness check's actual database probe (same real, timeboxed `SELECT 1`, same
// redaction) rather than inventing a second, independently drifting reachability check —
// #279's own scope names this explicitly: "reusing #275's reachability building block
// where it fits."
//
// `DATABASE_REACHABILITY_CHECK` is an injection token, not a direct import of
// `assertDatabaseReachable`, for the same reason `PrismaService`/`PDF_RENDERER` are
// swapped out in `test/support/build-test-app.ts`: the plain no-DB `test` job (ADR-0004)
// must never dial a real Postgres just because a health module exists in the DI graph.
// `HealthModule` wires the real function; `build-test-app.ts` wires a fast stub.
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
   * error. `assertDatabaseReachable`'s own redaction already strips the DSN/credentials
   * (host:port only, cause reduced to a class name), but this readiness probe has no
   * auth in front of it (#279's own DoR names the disclosure question; the kubelet polls
   * it from inside the cluster, but nothing at the application layer stops an external
   * caller from reaching it too if the ingress/NetworkPolicy is ever misconfigured — a
   * deployment-layer control, not this endpoint's). So even the redacted-but-still-real
   * finding is logged HERE, server-side, and goes no further than that.
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
