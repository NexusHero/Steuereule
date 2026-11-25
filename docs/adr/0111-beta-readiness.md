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
   The year is the calendar year in German time. Payments and versions from before the holds existed get
   theirs by migration.
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
  An architecture test forbids comparing `.status` with a 2xx value or a 300/400 bound in the web app. It
  does not see `.ok`, a destructured status or a default after a failed load.
- Saves of profile, master data, Person B and business pages change only the fields the request carries; an
  absent field is not a cleared one, `null` clears. The routes stay `PUT` with these semantics; the profile
  still requires both names on every save.
- One wording for failures (401 with a return to the same place, step-up, 409, 413, 429 with the wait,
  validation, offline, server error); the account export still shows the general text for a 429. A screen
  whose load failed shows an error with a retry, never an empty form. A shared test helper answers every
  request with 500 and asserts that no write is sent; it is called from a test per screen, and no test yet
  demands such a test for every screen.
- An expired session answers 401 `SESSION_EXPIRED` instead of continuing as a guest. The app opens the
  sign-in, remembers the place and drops the query cache and the confirmed notices, as a sign-out does;
  requests outside the generated client go through `net/apiFetch.ts`, which
  reports it too, and an architecture test forbids a bare `fetch` in the app.

### The user wins, in one place

- Every user write route of a mask carries `@UserWrite(<masks>)`; an interceptor compares the marked fields
  of every mask before and after the write and removes the markings of the ones that changed, whatever the
  route names. A lock test enumerates the write routes of the booted app; controllers that write no mask
  field are exempt as a whole, by name. Saving an unchanged value no longer confirms it.
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
- `beleg_hochladen` takes the file as base64 through the REST upload's service (type by content, 10 MB,
  quota); its rate limit is a counter of its own. The two MCP message routes accept 15 MB only with a valid
  bearer token, checked by the guard's own decision before the body is read (a larger body without one gets
  401 with the challenge); an opaque token also needs the consent to still exist.
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
- The app shows the price read from the same Stripe price before the redirect; when Stripe cannot be read,
  it says that the payment page shows the price.

### Lifecycle and data protection

- `apps/api/src/account/personal-data-registry.ts` lists every model with how it is tied to a person and how
  deletion, export, guest takeover and holds treat it. Deletion, export and takeover iterate it for the
  rows tied to a person id; the export sections and deletion steps it names are written by hand. A lock test
  fails for a model that is not in it.
- Holds are written with the payment and with the submission. On deletion the held `Unlock` and
  `FilingVersion` rows stay under the account id until the hold ends; the hourly sweep then erases them and
  removes the hold only after the erasure succeeded.
- Person B's shadow rows are deleted and exported with the account; when B deletes her own account, A's
  joint years keep their filing type.
- The export adds sessions, passkeys, two-factor status, device codes, assistants and consents, and the
  receipt files themselves.
- Sweeps: never-verified accounts per ADR-0030 (warning mails, then deletion), ended sessions, tokens and device codes after 30 days, the
  access log after three years, expired holds.
- A never-verified account sees a banner on every screen of the app with the date no sooner than which it is
  deleted (`GET /v1/account/verification`; 30 days after registration, 7 after the warning) and the way to the
  export. The verification link of an account that no longer exists lands on the sign-in page with
  `ACCOUNT_REMOVED`, which says so and offers a new registration (ADR-0030 §5); the API reads the address of a
  token it signed whatever its age, since better-auth checks the expiry first.
- Every read of tax data writes its audit row. A read of the figures of a Person B without an account is
  logged under B's shadow id; the access log and the export of the account that keeps B show those rows.

### Account security

- Step-up is a rule (`apps/api/src/auth/step-up-policy.ts`), not a list: every action that creates a session or
  credential, links an identity, grants access to a third party or reaches another person's data needs a fresh
  session or a step-up grant. `/v1` routes carry `@RequiresStepUp`; a lock test classifies every better-auth
  endpoint and every Nest controller, and single routes only in the controllers that hold a sensitive one.
  Accounts without a password prove themselves with a passkey or a fresh sign-in at their provider.
  Not covered: choosing a joint return creates the invitation code without a step-up
  (`PUT /v1/steuerjahre/:jahr/kopplung`).
- A session created by the device flow takes over the approver's creation time, so it is never fresh and never
  extends the 30-day cap.
- Person B agrees per tax year (`POST /v1/steuerjahre/:jahr/kopplung/zustimmung`, with step-up); redeeming an
  invitation counts for that year. Until then Person A's readers get the joint year without B's id
  (`couplingVisibleTo`, applied by the tax-case reader for the estimate, the printout, the ELSTER help and the
  history); estimate and printout name the missing consent. One invitation code has one redeemer.
- Joint years that existed before this change keep their consent (NexusHero, 2026-11-25): B agreed to the
  coupling when it was made. The migration records it for every existing joint year with an own-account B,
  including years A created under an existing link. Every year created from now on needs B's consent.
- Person B can withdraw the consent of any year at any time, in B's own app
  (`DELETE /v1/steuerjahre/:jahr/kopplung/zustimmung`, after a confirmation and with step-up: a stolen session
  must not cut a couple's year apart). The joint year stays and B can agree again. It holds from the next
  request on, in the app (`couplingVisibleTo`) and in the database (see Row-level security).
- Google and Apple tokens are not stored; nothing uses them.
- After registration the account wall says "Bestätige deine E-Mail"; the verification link lands on the sign-in
  page with a note. The profile has its own sign-out and a password change.

### Masks

- Destructive and final actions ask through one confirm dialog that says what is lost; a lock test checks every
  generated mutation hook whose name carries a destructive verb against a registry.
- A booking identical to the last one from the same source within 30 seconds returns the first entry and posts
  nothing.
- The running tax year comes from the server clock (Europe/Berlin) through `GET /v1/capabilities`.
- Leaving a mask by any way that removes its route (a sheet's X, the browser's back, „Später weiter“) waits for
  its pending saves and stays once when one failed: every navigator gives each route a guard
  (`navigation/guardedRoute.tsx`, its `screenLayout`), and a lock test fails for a navigator without it. An
  expired session leaves without waiting. On the web, closing or reloading the tab asks first while a save is
  on its way or a field holds typed input not yet committed (`navigation/unsavedWork.ts`).

### Row-level security

- Every table with personal data (55) has row-level security enabled and forced; the lock test replays the
  migrations, so a policy dropped later or one whose condition is `true` fails it. Queries run as the role
  `steuereule_app` (no `BYPASSRLS`, owns no table); the request's identity is a transaction-local setting set
  with the first query. Without a setting a query sees nothing.
- Two logins. The migration login owns the schema and runs migrations, backfills and the field-key rotation;
  only the migrate job has its URL (`MIGRATE_DATABASE_URL`, read by the job's own service account). The API
  connects with a runtime login that the migrate job creates from `RUNTIME_DATABASE_URL`: member of
  `steuereule_app` and of nothing else, owner of nothing, none of SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB.
  In production the API checks this at boot and refuses to start otherwise
  (`apps/api/src/config/assert-database-role.ts`). The append-only tables let only their owner re-encrypt.
  A developer's database and the test tiers keep one login; there the per-connection switch to
  `steuereule_app` binds the policies.
- Paths that cross users (sweeps, account deletion, guest takeover, the payment webhook, better-auth lookups,
  the device flow, invitations) run under a named system reason; a lock test lists every call site.
- Partners: Person B reaches Person A's rows of every year. Person A reaches Person B's rows of a table with a
  tax year (29 tables) only for the years B agreed to (`app_rls.agreed_partner_years()`), and of a table
  without one (profile, master data, owl settings) while B agreed to some year; the app checks the year for
  both. A lock test fails for a table with a tax year that keeps the year-blind condition.
- Residual: the keystore database has no policies and one login (its rows are keys wrapped under
  `KEYSTORE_MASTER_KEY`, which the database never holds); the two identity settings are plain session settings, so row-level security does
  not protect against SQL injection or against code that names a system reason. In particular, whoever holds
  the runtime login's password can set `steuereule.system` (or `steuereule.erasure`) and pass every policy
  and the append-only erasure exception; the two logins keep such a caller from changing the schema, the
  policies or the triggers and from the re-encryption exception, not from the rows. Row-level security is a
  guard against bugs in the app (a query for the wrong user), not against a stolen runtime password.
- Outside a request a query has no identity, in the test tiers too: the DB tier runs its own seeding and
  assertions as `test-fixture` (`apps/api/test/support/database-fixture.ts`) and the app's repositories and
  services as the user a request would carry.

### Configuration and deployment

- `apps/api/src/config/production-config.ts` declares the values a deployment cannot run without. A deployment
  refuses to start without one, with a malformed one or with a known development value (including Redis over
  TLS and the Stripe key, webhook secret and price ids together), with a model base URL, and on Cloud Run with
  any `NODE_ENV` but `production`. A test compares the list with the deploy workflow, Terraform, the
  Dockerfiles and compose, and `.env.example` with what compose reads. The list is kept by hand: optional
  switches the code reads (model choice, limits, Apple sign-in, mail delivery) are not in it, and no test
  derives it from the code.
- The deploy updates the service environment instead of replacing it, refuses repository-level variables for
  an environment, and its deployer role may create a Cloud SQL backup.
- The marketing site is a third Cloud Run service; the setup wizard maps the bare domain to it. The app stays
  on `www.`, the API on `api.`.

### Limits and load

- A lock test lists every route; in the controllers named as costly, one that renders a PDF, calls a model,
  starts ERiC, exports or parses must carry a throttle. Which controllers are cheap is a list in the test.
  Another walks every class in a `*.dto.ts` file: strings, arrays and records are bounded. Path and query
  strings without a DTO are outside it.
- The printout check no longer renders the PDF.
- Free model calls stop at 70 % of the daily budget (`AI_PAID_RESERVE_PERCENT`).
- The session lookup no longer signs an unused JWT header.

### Texts

- One module (`packages/core/src/common/product-limits.ts`) holds the figures users read: limits, retention
  periods, hosting region, model providers. The privacy text, the deletion dialog and the website print from
  it, and a test keeps limits, periods, region and the provider list equal to what the code enforces. The
  countries of the providers are text.
- The owl consent version is `2026-11-24`, so existing consents are asked again.

## Not changed, with reasons

- **Per-user field keys** (ADR-0110): a migration of its own.
- **Geo-IP region of devices:** no source with a known licence is pinned.
- **`style-src 'unsafe-inline'`** and the dictation model hosts in the CSP: react-native-web and the dictation
  model need them.
- **Load measurement:** the nightly job runs one API process on a shared runner against 500 users, while
  production runs up to ten one-vCPU instances. Whether to measure per instance is left open; the budget is
  unchanged.

## Known gaps after the review of 2026-11-25

- The per-screen failure test, the step-up classification and the throttle classification rest on lists kept
  by hand; a new screen or a new route in a listed controller is not caught.
- Creating an invitation needs no step-up; the 15 MB body limit of the MCP routes applies before the token is
  checked.

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
