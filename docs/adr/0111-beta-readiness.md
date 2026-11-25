# ADR-0111 — Beta readiness: the findings of the completeness audit of 2026-11-24

- **Status:** Accepted
- **Date:** 2026-11-25
- **Deciders:** NexusHero (product owner) for the eight product decisions below; engineering for the rest.
- **Builds on** [ADR-0052](0052-agent-access-mcp.md), [ADR-0053](0053-beta-hosting-cloud-run.md),
  [ADR-0102](0102-ports-and-adapters-enforced-by-architecture-tests.md), [ADR-0103](0103-session-security-hardening.md)
  to [ADR-0109](0109-security-report-hardening.md), [ADR-0030](0030-system-initiated-deletion-of-unverified-accounts.md),
  [ADR-0062](0062-household-at-account-level.md).
- **Defers** [ADR-0110](0110-per-user-field-keys.md) (per-user field keys) unchanged.
- **Context tags:** security, data protection, reliability, payment, agent access, operations
- **Component:** `apps/api`, `apps/mobile-web`, `apps/website`, `packages/*`, `infra/gcp`, `.github/workflows`

## Context

On 2026-11-24 `main` at `1b21755e` was reviewed for a beta release in two rounds, by reading code only:
four reviews by surface (REST API, MCP and OAuth, web app and website, operations), then eight
completeness tables, each holding one rule against every instance (masks, stored data, routes, MCP tools,
screens, configuration, seams between components, user-facing claims). The rounds found 170 findings,
18 of them blocking, in eleven classes. Most blocking findings had one of two causes: the generated API
client returned error responses as data, so a failed load looked like "nothing saved yet" and the next save
overwrote stored values; and rules meant for every write path were wired by hand per service, so some
paths lacked them. The register and tables are kept outside the repository with the audit material.

Nothing here was run against a deployment, a real browser, a real MCP client or the payment provider. The
E2E, integration (database) and load tiers run in CI.

## Product decisions (NexusHero, 2026-11-24)

1. The marketing site is rewritten: its own build, only claims the code keeps, no price figures (the price
   lives in the Stripe price), a beta notice.
2. Legal holds are built: a paid unlock is kept 8 years from the end of the payment year (§ 147 AO,
   § 257 HGB), the submitted version in force 4 years from the end of the submission year (§ 169, § 170 AO).
3. Partner coupling needs Person B's consent per tax year.
4. One consent for personal data in the owl covers every model provider the code can call; the text names
   them and their countries.
5. The load budget stays p95 ≤ 1000 ms per endpoint at 500 users.
6. The MCP tool `beleg_hochladen` uploads the file itself.
7. Row-level security goes into this change.
8. The search for findings stops when two independent passes in a row bring no new blocking finding and no
   new security finding, and the estimate of the rest is zero for both.

## Decision

### Errors are errors, saves are partial

- The generated client throws `ApiError` (status, machine code, `Retry-After`, field errors) for every
  status from 400 and `NetworkError` when the request fails; the generated types describe success only.
  An architecture test forbids branching on a 2xx status in the web app.
- Saves of profile, master data and business pages change only the fields the request carries; an absent
  field is not a cleared one.
- One wording for failures (401 with a return to the same place, step-up, 409, 413, 429 with the wait,
  validation, offline, server error). A screen whose load failed shows an error with a retry, never an empty
  form; a lock test answers every request with 500 and asserts that no write is sent.
- An expired session answers 401 `SESSION_EXPIRED` instead of continuing as a guest.

### The user wins, in one place

- Every user write route carries `@UserWrite(<masks>)`; an interceptor settles the markings of the fields it
  changed. A lock test enumerates the write routes of the booted app. Saving an unchanged value no longer
  confirms it.
- Deleting a child or a rental object removes its markings. The partner-link repository joins the
  simulation's rolled-back transaction.
- Confirming an Anlage sends the version of each value it showed; a changed value answers 409
  `CONFIRMATION_STALE`. Bescheid values form their own Anlage `bescheid`, which never blocks printing.
- The ELSTER fill-in help treats unconfirmed values like open ones.

### Agent access (ADR-0052, amendment 10)

- One gate for every tool: a policy per tool, bounded arguments (`taxYear` 2000 to next year), the audit
  row names the assistant, one error shape with a code and a next step. Caps are counted under an advisory
  lock. `steuerjahre_auflisten`, `beleg_zuruecknehmen`, `aufgabe_zuruecknehmen` are new; the server sends
  instructions and tool annotations.
- `beleg_hochladen` takes the file as base64 through the REST upload's checks; the two MCP message routes
  accept 15 MB only with a bearer token.
- `zahllink:write` replaces `zahllink:read`, which is still accepted for existing refresh tokens and no
  longer advertised.
- A request to the MCP endpoint without a token gets 401 with a challenge before any guest identity exists.
- Accepted, unchanged: nothing verifies a client (amendment 8); the duplicate check of `kind_anlegen` answers
  about the user's own household.

### Payment

- One contract for the return from Stripe (`packages/core/src/common/payment-return.ts`), read by API and app.
- After a successful return the app shows "Zahlung wird bestätigt" and polls the unlock until it is paid or
  60 seconds pass.
- Checkout answers 409 `ALREADY_PAID` or `PAYMENT_PENDING`, reuses an open session with one idempotency key
  per attempt, and rebuilds a missing local row from the session's metadata. Full refunds and disputes
  revoke the unlock; a won dispute restores it.
- The app shows the price read from the same Stripe price before the redirect.

### Lifecycle and data protection

- `apps/api/src/account/personal-data-registry.ts` lists every model with how it is tied to a person and how
  deletion, export, guest takeover and holds treat it. Deletion, export and takeover read it; a lock test
  fails for a model that is not in it.
- Person B's shadow rows are deleted and exported with the account; when B deletes her own account, A's
  joint years keep their filing type.
- The export adds sessions, passkeys, two-factor status, device codes, assistants and consents, and the
  receipt files themselves.
- Sweeps: never-verified accounts per ADR-0030 (warning mails, then deletion), ended sessions, tokens and
  device codes after 30 days, the access log after three years, expired holds.
- Every read of tax data writes its audit row, also for a read of Person B's data.

### Account security

- Step-up is a rule (`apps/api/src/auth/step-up-policy.ts`), not a list: every action that creates a session or
  credential, links an identity, grants access to a third party or reaches another person's data needs a fresh
  session or a step-up grant. `/v1` routes carry `@RequiresStepUp`; a lock test classifies every Nest route and
  every better-auth endpoint. Accounts without a password prove themselves with a passkey or a fresh sign-in at
  their provider.
- A session created by the device flow takes over the approver's creation time, so it is never fresh and never
  extends the 30-day cap.
- Person B agrees per tax year (`POST /v1/steuerjahre/:jahr/kopplung/zustimmung`); redeeming an invitation counts
  for that year. Years that exist today keep their consent. The row-level policy reaches B's rows only through a
  joint year B agreed to. One invitation code has one redeemer.
- Google and Apple tokens are not stored; nothing uses them.
- After registration the account wall says "Bestätige deine E-Mail"; the verification link lands on the sign-in
  page with a note. The profile has its own sign-out and a password change.

### Masks

- Destructive and final actions ask through one confirm dialog that says what is lost; a lock test checks every
  destructive mutation against a registry.
- A booking identical to the last one from the same source within 30 seconds returns the first entry and posts
  nothing.
- The running tax year comes from the server clock (Europe/Berlin) through `GET /v1/capabilities`.

### Row-level security

- Every table with personal data (54) has row-level security enabled and forced. Queries run as the role
  `steuereule_app` (no `BYPASSRLS`, owns no table); the request's identity is a transaction-local setting set
  with the first query. Without a setting a query sees nothing.
- Paths that cross users (sweeps, account deletion, guest takeover, the payment webhook, better-auth lookups,
  the device flow, invitations) run under a named system reason; a lock test lists every call site.
- Residual: partners may read and write each other's rows in the database, narrowing stays with the app; the
  keystore database has no policies; row-level security does not protect against SQL injection.

### Configuration and deployment

- `apps/api/src/config/production-config.ts` declares every production value. A deployment refuses to start
  without one, with a malformed one or with a known development value (including Redis over TLS and the
  Stripe key, webhook secret and price ids together). A test compares the list with the deploy workflow,
  Terraform, the Dockerfiles, compose and `.env.example`.
- The deploy updates the service environment instead of replacing it, refuses repository-level variables for
  an environment, and its deployer role may create a Cloud SQL backup.
- The marketing site is a third Cloud Run service on the bare domain; the app stays on `www.`, the API on
  `api.`.

### Limits and load

- A lock test lists every route; one that renders a PDF, calls a model, starts ERiC, exports or parses must
  carry a throttle. Another walks every DTO: strings, arrays and records are bounded.
- The printout check no longer renders the PDF.
- Free model calls stop at 70 % of the daily budget (`AI_PAID_RESERVE_PERCENT`).
- The session lookup no longer signs an unused JWT header.

### Texts

- One module (`packages/core/src/common/product-limits.ts`) holds the figures users read: limits, retention
  periods, hosting region, model providers. The privacy text, the deletion dialog and the website print from
  it, and a test keeps it equal to what the code enforces.
- The owl consent version is `2026-11-24`, so existing consents are asked again.

## Not changed, with reasons

- **Per-user field keys** (ADR-0110): a migration of its own.
- **Geo-IP region of devices:** no source with a known licence is pinned.
- **`style-src 'unsafe-inline'`** and the dictation model hosts in the CSP: react-native-web and the dictation
  model need them.
- **Load measurement:** the nightly job runs one API process on a shared runner against 500 users, while
  production runs up to ten one-vCPU instances. Whether to measure per instance is left open; the budget is
  unchanged.

## Consequences

- A repository admin adds the required checks `e2e: scenario 09b (self-employment switch on)`,
  `security: dependency audit (production deps)`, `performance: load (many users, seeded accounts, think times)`
  and `static: opentofu validate`, and sets `DEPLOY_STAGING_AUTO` and `AI_EVAL_ENABLED` when ready.
- The first deployment follows `infra/README.md` step by step; the Stripe webhook subscribes to
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `charge.refunded`,
  `charge.dispute.created` and `charge.dispute.closed`.
- E2E scenarios that confirm an Anlage without the new body, or rely on the old payment parameter, fail until
  adjusted.
- Not verified by this change: anything against GCP, Stripe or a browser; the database-tier tests and the load
  budget run in CI.
