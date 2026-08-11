// #279 — liveness/readiness endpoints for k3s on Hetzner (Produkt-ADR-049,
// `finanzo-funke-design-system/project/research/adr/049-deployment-k3s-hetzner.md` —
// three-digit product log, not the four-digit `docs/adr/` engineering log; see
// ADR-0033's "Citation form" section for why the two must never be conflated).
// Deliberately
// **unauthenticated** and outside `UserContextGuard` (no `@UseGuards` — see
// `ProfileController` for the guarded shape this is NOT): the kubelet polls both paths
// before any session/cookie machinery is relevant, the same reasoning
// `AuthCapabilitiesController` already documents for its own unauthenticated probe.
//
// Path naming (`v1/health/live`, `v1/health/ready`) follows this API's own existing
// `v1/...` convention rather than the bare `/healthz`/`/livez`/`/readyz` some k8s docs
// use for the CONTROL PLANE's own components — nothing in k3s requires an unversioned
// path for a workload's own probes, the manifest's `httpGet.path` just has to match
// whatever this controller actually serves. RULED, Musti's §4 on #338: keep these paths.
// A fourth reason beyond the one above — `/v1/health/*` is one greppable prefix, so the
// Ingress/NetworkPolicy exclusion #338 F3 requires (tracked: #344) is one path prefix to
// deny at the edge; two unrelated top-level `/livez`+`/readyz` paths would make "deny
// both, and any future one" a rule that is easy to half-apply.
//
// PIN, do not "tidy" — if a `/v2` prefix ever lands, THESE TWO PATHS STAY AT `/v1`. Every
// k3s manifest's `httpGet.path` is a literal string with no redirect; moving them to
// match a newer prefix breaks every manifest silently, and a probe `404` reads to the
// kubelet as "not ready" — the failure mode of moving them for tidiness is an outage,
// not a build error that would catch the mistake first.
import { Controller, Get, HttpCode, Inject, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger'
import { HealthStatusDto } from './dto/health-status.dto.js'
import { HealthService } from './health.service.js'

@ApiTags('health')
@Controller('v1/health')
export class HealthController {
  // Explicit token: see ProfileController's constructor comment — this toolchain does
  // not emit `design:paramtypes`, so implicit constructor injection silently resolves
  // to undefined without it.
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  /**
   * Liveness: "is this process able to serve at all". Deliberately checks NOTHING
   * beyond the process being able to run this handler — no database, no external I/O.
   * A failed liveness probe gets the pod KILLED and restarted (k3s/kubelet convention,
   * #279's own scope); a transient database hiccup must not restart a pod that would
   * otherwise recover on its own once the database comes back — that is `ready`'s job,
   * not this one's. Conflating the two is the named production hazard #279 exists to
   * avoid, not a naming nitpick.
   */
  @Get('live')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthStatusDto, description: 'The process is running.' })
  live(): HealthStatusDto {
    return { status: 'ok' }
  }

  /**
   * Readiness: "can this pod actually serve real traffic right now". A failed readiness
   * probe pulls the pod OUT of the Service's endpoint list — not restarted — and k3s
   * keeps polling, re-adding it once this goes green again (e.g. once a transient
   * database outage clears).
   *
   * The response body carries only `{ status }`, on both branches — never the
   * database error, even redacted (see `HealthService.isDatabaseReachable`'s own
   * comment for why: this endpoint has no auth in front of it).
   */
  @Get('ready')
  @ApiOkResponse({ type: HealthStatusDto, description: 'The database is reachable.' })
  @ApiServiceUnavailableResponse({ type: HealthStatusDto, description: 'The database is not reachable.' })
  async ready(): Promise<HealthStatusDto> {
    const reachable = await this.healthService.isDatabaseReachable()
    if (!reachable) {
      // Passing a plain object (not a string) to ServiceUnavailableException makes
      // THAT object the response body verbatim — never Nest's default
      // {statusCode, message, error} shape, which would otherwise be the one place
      // this endpoint's own "never leak more than status" rule could be missed.
      throw new ServiceUnavailableException({ status: 'error' })
    }
    return { status: 'ok' }
  }
}
