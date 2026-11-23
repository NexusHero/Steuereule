# ADR-0053 — Beta hosting on Google Cloud Run and Cloud SQL

- **Status:** Accepted (stakeholder decision NexusHero, 2026-11-04)
- **Date:** 2026-11-04
- **Deciders:** NexusHero (stakeholder); Musti — architecture review on the PR
- **Amends:** product ADR-049 (k3s on Hetzner) — applies again only once load or
  availability requires it; ADR-0026 (the local Compose stack stays the local counterpart)

## Context

The beta starts with at most ten testers. The target picture from product ADR-049 (k3s cluster,
load balancer, managed Postgres from a third-party provider) costs around €30–60 a month and
requires us to operate the cluster, backups and updates ourselves. Infra #292 has been stuck on
exactly this effort for weeks.

Compared (net, rough, November 2026):

| | Hetzner, one VM with Compose | Google Cloud Run + Cloud SQL |
|---|---|---|
| First year | ~€95–135 | ~€130 (the starting credit covers the first 90 days) |
| From year 2 | ~€95–135 | ~€165 |
| Backups, PITR, logs, secrets | self-operated | managed |
| Provider | German | US provider, data center in the EU |

## Decision

The beta runs on Google Cloud in **`europe-west4`** (Netherlands):

- **Cloud Run** runs two services from the existing images: `steuereule-api`
  (1 vCPU, 2 GiB because of Chromium) and `steuereule-web`. Both scale to zero, at most
  two instances.
- **Cloud Run Job** `steuereule-migrate` runs `prisma migrate deploy` with the API image,
  before every API rollout — the counterpart of the `migrate` service in the Compose stack.
- **Cloud SQL** Postgres 16, tier `db-f1-micro`, daily backups and PITR. The API connects
  via the Unix socket that Cloud Run provides; there are no authorized networks.
- **Secret Manager** holds all secrets. OpenTofu only creates the empty secrets; the values
  are generated locally by `scripts/infra/gcp-setup.sh`, which writes them directly into them.
  This way no secret ends up in the Tofu state.
- **Artifact Registry** instead of GHCR, with a cleanup rule (the last five images are kept).
- **GitHub Actions** deploys via Workload Identity Federation, without a long-lived key.
  Access is restricted to `NexusHero/Steuereule`.
- **Own domain** with `www.` (web) and `api.` (API) via Cloud Run domain mappings.
  The `*.run.app` addresses are on the Public Suffix List; web and API would then be two
  sites, the session cookie a third-party cookie, and Safari would block the login.
  Domain mappings are the reason for `europe-west4` instead of Frankfurt.
- **Budget alert** at €20 a month.

The Hetzner part under `infra/terraform`, `infra/k3s` and `infra/manifests` stays in place as
the target picture for later, but is not deployed.

## Consequences

- **Cost:** ~€12–15 a month, regardless of whether one or ten testers are active; almost
  all of it is Cloud SQL. Between test rounds the instance can be stopped (~€2–3).
- **Cold start:** After idle time the first request takes 5–10 seconds. A permanently warm
  instance would cost ~€50 a month and is not planned for the beta.
- **Data protection:** Google is a US provider (CLOUD Act). This belongs in the DSFA (data
  protection impact assessment) and in the privacy policy; the AVV (data processing agreement)
  with Google must be concluded before the first real tester.
- **To check before the first rollout:**
  - that Cloud Run domain mappings are available in `europe-west4` (`gcloud beta run
    domain-mappings create` otherwise fails immediately; the way out would be a load balancer for ~€18);
  - which peer address the API sees behind Cloud Run. `TRUSTED_PROXIES` is set as a
    repo variable and pre-filled with `169.254.0.0/16`; a wrong value makes all
    testers share one common rate-limit bucket (fail-closed, not fail-open).
- **Deliberate deviations:** `/v1/health/*` is publicly reachable because Cloud Run has no
  second, internal port (#344 only applies to a cluster). The endpoints return only
  `ok`/`error`. Redis is dropped until BullMQ queues are actually built.
- **Known risk:** Cloud Run shuts down instances after idle time. A crashed
  Chromium process is not restarted today (#288); the next cold start heals that,
  a long-lived process does not.

## Alternatives

- **Hetzner, one VM with Compose:** somewhat cheaper from year 2, German provider. Rejected,
  because backups, PITR, updates and monitoring would then have to be operated ourselves.
- **k3s on Hetzner (product ADR-049):** too expensive and too much effort for ten testers.
- **Global External Load Balancer instead of domain mappings:** allows Frankfurt, but costs
  an additional ~€18 a month. Remains the way out if the domain mappings are not available.
