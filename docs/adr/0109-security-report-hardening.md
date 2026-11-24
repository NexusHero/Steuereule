# ADR-0109 — Hardening after the security report of 2026-11-24

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** engineering and the product owner (retention period, alerting, dependency gate, sign-up flow).
- **Builds on** [ADR-0103](0103-session-security-hardening.md), [ADR-0104](0104-pentest-finding-fixes.md),
  [ADR-0106](0106-live-pentest-fixes.md), [ADR-0053](0053-beta-hosting-cloud-run.md),
  [ADR-0105](0105-ci-gate-taxonomy-and-transparency.md), [ADR-0030](0030-system-initiated-deletion-of-unverified-accounts.md).
- **Supersedes in part** ADR-0103 §4 (verification only gated at filing) and ADR-0106 "D10" (sign-up reveals an
  existing account).
- **Context tags:** security, availability, auth, infrastructure, supply-chain
- **Component:** `apps/api`, `apps/mobile-web`, `infra/gcp`, `.github/workflows`, both Dockerfiles

## Context

A code review of `main` at `0f30e251` rated user-data protection B+, availability C+ and platform, supply
chain and operations C+. It found no way to another user's data and no single request that stops the
server. What it found were limits that count per process, expensive paths without a limit, data that is
never deleted, a container scan that suppresses about 100 entries, no alerting, one environment, and an
account oracle at sign-up. This ADR records what was changed and what was left.

The review read code. Nothing here was measured under load or tried against a deployed system.

## Decision

### Availability

1. **Every limit counts in the shared storage.** The Nest throttler used its in-memory store, so each of up
   to ten instances allowed the full limit. `SharedThrottlerStorage` puts `@Throttle` on the rate-limit
   storage better-auth already uses (Redis when `REDIS_URL` is set, in memory otherwise). That storage now
   holds one reused connection instead of opening one per call, and `consume` takes an amount, so byte
   budgets can use it. The storage answers allowed or refused, not a hit count, so the
   `X-RateLimit-Remaining` header is coarse.
2. **Redis is on by default**, in local development (`.env.example`, `scripts/local.sh`), in the production
   compose stack and in `infra/gcp` (`enable_redis` defaults to true, about 35 EUR a month per
   environment; the default budget is raised from 20 to 60 EUR). In GCP it requires AUTH and in-transit
   encryption; the API reads the server CA from `REDIS_TLS_CA`. The AUTH string is part of the connection
   URL that Terraform writes to Secret Manager, so it is in the state. That conflicts with ADR-0053 ("no
   secret in state") and is accepted: the state bucket is private and the instance has no public address.
3. **Uploads are admitted, not queued.** At most 4 uploads are in flight per instance
   (`UPLOAD_MAX_IN_FLIGHT`) and 1 per account or guest address; more get 429 with `Retry-After`. A guest
   address may upload 100 MB a day (`GUEST_UPLOAD_BYTES_PER_DAY`), because a request without a cookie gets
   a new guest id and the per-account quota never bound it. All guests together may upload 5 GiB a
   day (`GUEST_UPLOAD_BYTES_PER_DAY_TOTAL`), which bounds a caller with many addresses; past it a guest is
   told to create an account. Two avoidable copies of the file were removed.
   The file is still buffered once, and the per-address cap of one upload is per instance.
4. **Export and printout.** The account export is throttled to 5 an hour. The PDF lists the newest 1,000
   access-log entries and says so; the JSON export stays complete, because it answers Art. 15 and 20 GDPR, and is
   read in batches and sent as a stream.
   The PDF renderer queue holds at most 8 waiting renders, a render times out after 60 seconds. Asynchronous
   printout jobs are throttled (10 per 10 minutes), limited to 3 held jobs per account and dropped after
   10 minutes; a job no longer keeps its PDF in memory.
5. **`/api/auth/*` refuses bodies over 64 KiB** with 413, by `Content-Length` and while reading.
6. **Model calls have a daily cap across all users** (`AI_DAILY_CALL_LIMIT`, default 10,000, counted per
   chat turn, summary and vision read). When it is spent the owl answers from its rules, as it does when no
   provider is configured. Receipt parsing is capped at 300 a day per user (`PARSE_DAILY_LIMIT`).
7. **Lists are bounded:** the newest 2,000 chat messages, 20,000 bank transactions per book, 200 entries in
   the booking `lines` and `totals` arrays, 100 characters for profile names. The Brevo call times out
   after 10 seconds.
8. **An unhandled rejection ends the process after a drain.** The state after an unknown rejection is
   unknown, so the instance still goes, but it first stops accepting and lets requests in flight finish
   (10 seconds at most). Unexpected errors are logged in production as one JSON line that Cloud Error
   Reporting groups: severity, message with stack, request id and route template, no body and no headers.

### User data

9. **Guest data is deleted 30 days after the guest's last write.** `GuestActivity` records the last write
   (at most once an hour per guest). The sweep uses the account-deletion transaction, including key
   shredding and legal holds. Existing guests get 30 days from deployment. Like the sweep of ADR-0029 it
   runs on traffic (at most hourly per process, 25 guests a run): with no requests nothing is deleted, so
   the promise is "no sooner than 30 days".
10. **Password reset by e-mail.** The link lives 30 minutes and works once. A reset revokes every session
    and the account's assistant grants, as a password change does. The request answers the same for a known
    and an unknown address; 3 an hour per target address, 5 per 10 minutes per client address. `redirectTo`
    must be the web app's origin.
11. **Sign-up no longer reveals an account.** `requireEmailVerification` is on. A sign-up answers 200 with
    no session for a free and a taken address alike; the owner of a taken address gets a notice by mail. The
    account is usable after the verification link, and the link does not sign in: otherwise someone who
    registered a victim's address with their own password could get the victim into that account. The
    guest keeps working meanwhile, and the guest's data moves to the account at the first verified sign-in
    in the same browser. Consequences: accounts that never verified must follow a new link before they can
    sign in (accepted by the product owner); `@RequiresVerifiedEmail()` is redundant for e-mail accounts;
    the "signed in but unverified" state no longer exists for them. The registration form asks for 12
    characters, as the server has required since ADR-0103.
12. **E-mail, display name and the session's address are encrypted.** better-auth now runs on the
    encrypting client. `User.email` is found through `emailHash`, a salted hash of the lower-cased address
    with a unique index; the salt is its own secret (`PRISMA_FIELD_ENCRYPTION_HASH_SALT`, required in
    production) and cannot change without re-hashing every account. The library passes a value that is not
    ciphertext through on read, so old and new rows are served side by side and strict mode stays on.
    Deploy order: set the salt, migrate, hash phase, release, encrypt phase. The migrate role runs the hash
    phase itself, so a release cannot go out with accounts it cannot find; the encrypt phase is run by hand
    after the release (`node --import tsx scripts/backfill-identity.ts` in the image). The unique index on `User.email` stays until a
    later contract step. Prefix search and ordering by e-mail no longer work; nothing uses them. The
    sign-in limit still holds the address in the rate-limit storage for 15 minutes.
13. **Links the model writes** open directly only for https links to a short list of official hosts. Any
    other host is shown and has to be confirmed; links with credentials, another scheme or a query over
    200 characters are plain text.

### Platform, supply chain, operations

14. **Dependency gate.** `security: dependency audit (production deps)` fails on high and critical
    advisories in production dependencies. Exceptions carry a reason and an expiry date
    (`scripts/checks/dependency-audit.mjs`). There is no update bot (decision of the product owner).
15. **The API image carries what the app runs and nothing that installs or builds.** Three stages: build,
    a production tree made by pnpm, and a runtime stage that copies that tree and has neither pnpm nor npm
    nor corepack. Optional peers (vitest, typescript) that pnpm resolves to the workspace's dev dependencies
    are removed from the tree, and an import check proves the app loads without them. The sources of
    `apps/api` are in the image because the migrate role's backfills are TypeScript. The migrate role runs
    `node scripts/migrate-deploy.mjs` without pnpm. `.trivyignore` was rebuilt from a scan of the images'
    SBOMs without it: of 63 HIGH/CRITICAL ids in the API image one remains, with its reason
    (`deepmerge-ts` inside the Prisma CLI).
16. **The web server sends security headers.** HSTS, `nosniff`, `X-Frame-Options: DENY`, a referrer and a
    permissions policy always; a Content-Security-Policy when it knows the API origin (`API_ORIGIN`). The
    local E2E servers pass none, so the policy is enforced in the production-image job only.
17. **Alerting uses Cloud Monitoring** (decision of the product owner: no further processor): an uptime
    check, alerts on the 5xx ratio, container crashes, unhandled errors, Cloud SQL disk and CPU, by e-mail.
    All of it is skipped while `alert_email` is empty. `docs/sre/incident-runbook.md` says what each means.
18. **Staging and production are separate.** `infra/gcp` takes an `environment`; a green CI on `main`
    deploys staging, production is deployed by hand through the GitHub environment `production`. The
    workload identity condition checks the environment claim.
19. **Both Cloud SQL instances have a private address only.** The API and the migrate job reach them through
    Direct VPC egress and the Cloud SQL socket, so the VPC is now a required part of the stack and the Trivy
    exception is gone. Production gets a dedicated-core tier and regional availability; beta and staging keep
    the shared core. `max_connections` follows from instances × pool + migrate + headroom (60 on the shared
    core, untested under load).
20. **Secret scan exceptions name values, not patterns or directories.**

## Not changed, with reasons

- **Field-encrypted columns share one key.** Per-user keys are proposed in
  [ADR-0110](0110-per-user-field-keys.md) and not built here.
- **The printout job cap is per instance**, because the jobs live in the process; the shared throttle on the
  start route bounds an account across instances.
- **Model providers are in the United States.** Covered by consent (ADR-0091); no EU endpoint is configured.

## Consequences

- With Redis unreachable every limit falls back to the process, as before. With Redis reachable a refused
  request costs one round trip.
- An operator moving the existing beta stack follows the sequence in `infra/README.md` (the move to the
  private address restarts the databases) and has to run Terraform with `environment=beta` once (this
  replaces the Redis instance), create the GitHub environment `staging`, set `alert_email` and
  `api_hostname`, and add the new check name to the `main` ruleset. Production needs its own GCP project.
- Not verified by this change: the image build, Redis over TLS against a real server, the Cloud Monitoring
  filters, upload admission over real HTTP, and the E2E scenarios on the new sign-up flow. CI confirms the
  first and the last; the others need a deployment.
