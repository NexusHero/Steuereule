# ADR-0052 — Agent access: the user's own AI assistant fills in the tax return (MCP)

- **Status:** Accepted (stakeholder decision NexusHero, 2026-11-03) — draft from the
  grilling session with NexusHero; Musti review runs on the slice PRs
- **Date:** 2026-11-05
- **Deciders:** NexusHero (stakeholder) — decisions; Musti — architecture review
- **Amends / supplements:** product ADR-014/048 (AI suggests, never directly), ADR-0051 (no
  personal data to external AI), ADR-0049 (marking layer of the year carry-over),
  ADR-0009 (better-auth as auth server), ADR-0050 (paper route, payment at printout)
- **Postpones:** the 1.0 go-live (see Consequences)

## Context

Users want to use SteuerEule with their own AI assistant (Claude, Gemini, DeepSeek or others):
the assistant should evaluate documents and fill in the tax return in the app
largely on its own. The app is not built for this today:

- Identity is an httpOnly session cookie (ADR-0007/0009); there is no access for third-party clients.
- Every form knows only values, no origin. "Unconfirmed" exists only for carried-over
  previous-year values (ADR-0049).
- Product ADR-014/048 lets an AI only suggest; only the user's confirmation turns it into an
  item. ADR-0051 forbids personal data to external models — for *our* AI.
- The document inbox stores only metadata (file name, type, date), no files.

## Decision

1. **Actor: the user's own assistant.** SteuerEule provides an interface; the
   user connects it to their assistant. We do not call any third-party model and do not run
   an agent. Third parties that handle tax returns for many users (payroll offices, other apps)
   are excluded. Accounts only, no guest sessions (ADR-0045).

2. **Interface: a remote MCP server with OAuth 2.1.** Authorization via the OAuth/OIDC
   provider plugin of better-auth (ADR-0009): one login, one identity, no second auth service.
   The user grants access on a consent page that shows the assistant's name from
   the client registration.

3. **Tools: a few domain tools** in the language of the tax return — not generated from the OpenAPI.
   At a minimum: status of a tax year, what is missing for the printout (pre-check), one tool per
   form for entering data (Lohnsteuerbescheinigung (wage tax certificate), interview answers, children,
   rental income, capital, Lohnausweis/N-Gre, master data, linking), upload document, read owl
   hints, request payment link.

4. **Scope.** The agent reads and writes all tax facts, master data and the linking, and uploads
   documents including the file. **Not via the interface:** delete account, email, password,
   passkeys, sign out devices, any consent (in particular Art. 9 DSGVO (GDPR) on religion, the
   owl mode, the agent access itself) and paying.

5. **Payment.** The agent can trigger the Stripe checkout and receives the payment link; paying, and
   thereby concluding the contract, is done by the human (ADR-0050).

6. **Collective confirmation instead of confirmation per value** — an amendment, not a repeal of
   product ADR-014/048. Everything the agent writes is **unconfirmed** and carries its origin
   („Assistent: Claude, aus Beleg X“, "Assistant: Claude, from document X"). The user reviews in the app **per Anlage** (schedule) and confirms or
   changes. Pre-check, printout and payment treat unconfirmed values like open ones. Technically this
   is the marking layer from ADR-0049, extended to every form.

7. **Conflicts: the user wins.** If the agent writes a value that the user has confirmed or
   entered themselves, that value stays; the agent value appears as a suggestion
   („Assistent schlägt 4.800 statt 4.750 vor“, "Assistant suggests 4,800 instead of 4,750").

8. **Personal data: write yes, read masked.** Steuer-ID (tax identification number), IBAN, address, names of
   third parties (partner, other parent, employer) are returned by the interface only masked.
   What is in the app once does not flow to the model again. ADR-0051 applies unchanged to our
   own AI; the data flow to the user's assistant happens at the user's instigation and is
   governed separately.

9. **Third countries.** We do not block any providers. The consent page states clearly that the data goes to the
   provider of the chosen assistant — possibly to a country without an
   adequacy decision — and that the decision lies with the user.

10. **Duration and revocation.** A connection applies indefinitely until the user revokes it. Mandatory
    is therefore an overview „Verbundene Assistenten“ ("Connected assistants") (name, connected since, last used,
    revoke) next to the device management. Every access is logged in the audit log with the assistant as
    the source (REQ-004).

11. **Documents with files.** The document inbox gets real file storage: EU object storage,
    encrypted, type and size check, virus scan, part of DSGVO export and deletion. We do not read
    the files server-side — the assistant does that; the file is the evidence.

12. **Owl mode stays.** It serves users without their own assistant; the agent gets the
    owl cards as the tool "hints" and sees the same findings.

13. **Timing: before 1.0, and the go-live waits for it.** DSGVO audit, DSFA (data protection impact assessment)
    and legal review (#329) cover the agent access from the start.

## Consequences

- **Second identity path.** Besides the session cookie there are bearer tokens with scopes. Every guard,
  every rate limit (#350) and the audit log must know both paths; the excluded actions
  from point 4 are refused server-side for tokens, not merely not offered. An indefinite
  token with broad access is a worthwhile target — short access token lifetime with refresh,
  revocation takes effect immediately.
- **Origin becomes a cross-cutting concern.** Today every form stores only the value. In future every
  value needs an origin and a confirmation state; cockpit, pre-check, printout, year carry-over and
  DSGVO export must evaluate it. This is the largest rebuild of this undertaking.
- **New infrastructure.** OAuth provider (better-auth plugin), MCP server, object storage with
  virus scan. The file storage depends on the still-open Hetzner infrastructure (#292) — this makes the
  infrastructure track even more of a critical path.
- **Legal.** In addition to #329: delimitation from commercial assistance in tax matters (StBerG)
  for the "own assistant" model, DSFA for the agent access,
  privacy policy (third-country notice), terms clause on the user's responsibility for confirmed
  values.
- **Product promise.** "Fully automatic" means: the assistant fills in, the human reviews and
  confirms per Anlage. Marketing and website must not promise more.
- **Load.** Agents call more often and faster than humans; the load test (ticket 11) and
  rate limits must cover agent traffic.
- **Quality gate.** An end-to-end test with a real MCP client in CI: connecting,
  tools, unconfirmed values, confirmation per Anlage, revocation, refused account actions.
- **1.0 is postponed** by this block, including audit and legal review.

## Implementation (ticket breakdown)

In dependency order; details in the roadmap ticket `17-agenten-zugang-mcp.md`.

1. **Origin and confirmation for every form** — generalize the marking layer from ADR-0049;
   pre-check, printout and payment treat "unconfirmed" like open;
   confirmation screen per Anlage; conflict rule "user wins".
2. **OAuth provider** — better-auth plugin, scopes, consent page with third-country notice,
   overview „Verbundene Assistenten“ with revocation, token path in guards, rate limits and audit.
3. **MCP server** — domain tools, masking on read, refused actions server-side,
   CI test with a real MCP client.
4. **File storage for documents** — EU object storage, encryption, checks, virus scan, export and
   deletion (depends on #292).
5. **Law and data protection** — legal review, DSFA, privacy policy,
   terms; part of the 1.0 acceptance.

## Rejected alternatives

- **We run the agent (our own model call).** We would become the controller for the
  data transfer to every provider (data processing, third country) and would bear the model costs.
- **Third parties for many users.** Close to commercial assistance in tax matters; liability and
  risk of misuse considerably greater.
- **Agent values apply immediately.** Contradicts product ADR-014/048 and puts the responsibility
  for a tax return into a model.
- **Personal API key instead of OAuth.** A long-lived secret with broad access that sits in the
  assistant in plain text; no standardized consent and revocation path.
- **Generate tools from the OpenAPI.** Around 80 technical tools overwhelm many models
  and expose internals.
- **Block known providers.** Trivial to bypass via the freely chosen client name.

## Amendment 1 (2026-11-03) — Implementation 17.1: origin and confirmation (#384, REQ-032)

Stakeholder decisions (NexusHero, refinement 17.1):

- Unconfirmed values block pre-check, printout and payment **regardless of origin** —
  including existing, unconfirmed year carry-overs.
- "The user wins" (§7) applies to **every** non-user writer, including the year carry-over:
  it no longer overwrites a value entered in the target year, but files a suggestion instead.
- Confirmation happens on a dedicated screen „Prüfen & bestätigen“ ("Review & confirm") (reachable from the cockpit hint and the
  printout pre-check); the single-confirm button of the carry-over is dropped.
- There is at most one open suggestion per field; the newest replaces the older one.

Technical cut (follows from §6/§7, without a new dependency):

- The table `UebernahmeKennzeichnung` (ADR-0049) is renamed to the generic `Kennzeichnung`
  and kept per **field** (`<maske>[:<instanz>].<feld>`); existing fact markings are
  fanned out to their fields by a migration. No row = entered by the user = confirmed.
  Profile and master data are independent of the year and sit under tax year 0.
- The suggestion value is encrypted (`mode=strict`), because it can carry anything a form
  stores. Origin and confirmation are part of export and deletion.
- If the user changes a value themselves, it counts as confirmed (the marking is dropped). An
  open suggestion on a confirmed value does not block — it is not a value of the tax return.
- With Zusammenveranlagung (joint assessment), unconfirmed values of Person B also block (`unbestaetigt.personB`);
  Person B confirms in their own app.
- The decision between writing and suggesting lies in the core (`kennzeichnung.ts`); the API reads
  and writes fields only via the forms' repositories. 17.1 wires up the forms that a
  non-user can fill today (LStB, pension, capital, rental income); the remaining forms get
  the write path and user hook together with the assistant (17.3).

## Amendment 2 (2026-11-20) — Advice and feedback for the assistant

Stakeholder decision (NexusHero): The user's assistant gets the same domain advice
as the in-app advisor, so that it can run the tax return on its own and give its user
feedback. No model call on our side (§1 stays): the advice consists of **deterministic
tools**, not an agent-to-agent question to our LLM.

- **Advice tools** (scope `steuerdaten:read`, they neither read nor write user data, audited):
  `einkommensteuer_berechnen`, `veranlagungsarten_vergleichen`, `kapitalertraege_guenstigerpruefung`,
  `spekulationsfrist_pruefen`, `renovierung_15_prozent_pruefen`, `schenkungsteuer_berechnen`,
  `kleinunternehmer_pruefen`, `gewerbesteuer_schaetzen`, `steuerwissen_lesen`, `gesetzestext_lesen`,
  `rechtsquelle_nachschlagen`. They share schemas and calculation core with the in-app advisor
  (`TOOL_ARG_SCHEMAS`), so the numbers are the same.
- **Feedback:** `steuerbericht` (estimate, printout gaps, unconfirmed Anlagen, open questions,
  next steps), `offene_fragen` (next interview question with possible answers, only the user
  knows them) and `auswirkung_simulieren` (refund before/after via the real write path in a
  transaction that is always rolled back; scope `steuerdaten:write`, never inside a running transaction).
- **External text marked:** `gesetzestext_lesen` returns the retrieved wording with `untrusted: true`
  and the note to cite it only as a source.
- **Entering with the same target check as the internal advisor:** `maske_eintragen` rejects unknown
  fields, never-writable fields, the bookkeeping form and values the field cannot hold, giving
  the reason. Personal fields stay open for the user's own assistant (§8).
- **Person B (Zusammenveranlagung, ADR-0054):** `maske_eintragen` and `auswirkung_simulieren` take
  `person` (A/B) with the rules of the in-app advisor (`checkDraftPerson`): B only if the user manages B's
  details, only in B's own forms, where the person is mandatory. The user confirms B's
  unconfirmed values and decides on their suggestions as well on „Prüfen & bestätigen“ (marked as „Person B“);
  confirming an Anlage applies to both.
- **Children as records:** `kinder_auflisten` (first name masked, year of birth, `instance`) and
  `kind_anlegen` (scope `steuerdaten:write`); the details follow with `maske_eintragen`, form `kind`.
- **Sign-in for standard MCP clients** (MCP Authorization, RFC 9728/8414/8707), verified in a local run with a
  real MCP client: `/mcp/sse` answers without a token with 401 and
  `WWW-Authenticate: Bearer resource_metadata=…`; `/.well-known/oauth-protected-resource[/mcp/sse]` names
  better-auth under `/api/auth` as the server, whose metadata is also available under
  `/.well-known/oauth-authorization-server[/api/auth]`. The MCP endpoint is an OAuth resource;
  its entry is created on the first `/oauth2/` request (`ensureMcpResource`), not at startup, so that
  the app boots without a database. Tokens for this resource are JWTs (issuer `…/api/auth`,
  audience `…/mcp/sse`); the guard checks them against its own keys and additionally requires the
  still-existing consent, so that a revocation takes effect immediately for JWTs too (§10). Clients with
  loopback redirect count as native (RFC 8252), `offline_access` grants refresh tokens, and the
  consent page states that the connection lasts until revoked.
- **Undoing its own mistakes:** `eintrag_zuruecknehmen` clears an unconfirmed value or discards
  a suggestion, both only if the same assistant wrote it. `kind_entfernen` deletes only
  a child that the assistant created and on which nothing is confirmed or entered by the user;
  for this, `kind_anlegen` marks name and date of birth as unconfirmed entries of the assistant.
  A duplicate `kind_anlegen` returns the existing child.
- **Describing fields:** `maske_felder` returns shape and hint from the field catalog per form; references
  to tools of the in-app advisor are reworded for the external assistant.
- **Not yet:** bookings and fixed assets (self-employed) and new rental properties via MCP. Payment, account and consents remain excluded (§4).

## Amendment 3 (2026-11-20) — Read view: the assistant reads derived data, not details

Stakeholder decisions (NexusHero, grilling 20.11.2026 after the real-data run 2024 via MCP).
Tightens §8 ("read masked") into data minimization; applies only to the external assistant, the
in-app advisor keeps ADR-0091.

1. **Persons only derived.** Per person (user, partner, children): age on 31.12. of the tax year
   instead of date of birth, federal state instead of address (no postcode, no town, no street), marital status and
   assessment type, occupational group from the interview answer `beruf` (not the job title).
   Steuer-ID and IBAN never, not even masked.
2. **Amounts in plain text.** Tax amounts identify nobody and are the core of the advice.
3. **Write precisely, read derived.** The assistant writes precise values (date of birth,
   employer address); it reads them back derived, including its own („Geburtsdatum gesetzt,
   Alter 33“, "date of birth set, age 33").
4. **Third parties only as role and country** („Arbeitgeber 1, Schweiz“, "employer 1, Switzerland"); employers, daycare, tradespeople,
   donation recipients and the other parent without names and addresses.
5. **Free text only as "set".** Remarks, explanations and notes do not flow back.
6. **Children as number and age** with `instance`, without initials; the assistant keeps the mapping of children
   of the same age itself (from `kind_anlegen`).
7. **Church tax without denomination.** Per person, the assistant writes only the new detail
   "subject to church tax yes/no", which the estimate uses; a denomination (Art. 9 DSGVO) is entered by the
   user with consent in the app. With "yes" without a denomination, the report flags a gap for
   the printout. If the two contradict each other, the user's denomination applies (§7), and the report names the
   contradiction. The religion key is no longer writable via MCP.
8. **Tools.** `maske_lesen(screen, person)`: per field the value (amounts in plain text, personal data derived),
   state (confirmed / unconfirmed / suggestion open) and origin as a type (user, you yourself, other
   assistant, year carry-over, document; no names of other assistants). `haushalt_ueberblick` replaces
   `steuerjahr_stand`. Documents readable with belegId, type, year, date and the fields whose origin they
   are, without file names.
9. **Transparency** via the audit log as before (REQ-004); no separate view.

In addition, from the real-data run, further tools for the assistant's work (ticket breakdown in
`17-agenten-zugang-mcp.md`, slices 17.8–17.13): batch entry per form, breakdown of the estimate
(calculation path), Bescheid (tax assessment notice) reconciliation with the objection deadline, check rules and printout plan, tasks for the
user, convenience (assessment comparison from case data, multi-field scenario, exchange rates, Vordruck (form) lines,
find field, previous year and deadlines), rental properties and bookings. Still excluded:
reading documents server-side (§11), consents, payment, account actions.

## Amendment 4 (2026-11-21) — The assistant's access ends at the MCP endpoint

Finding from the security review after the real-data runs: since 17.2 an assistant token had been accepted by
`UserContextGuard` on every route and treated by `RequiresAccount` like a user session;
it was blocked only where `@ForbidAssistant()` was present (5 of 39 controllers). Via the normal
API, the read view (Amendment 3), the scopes and "only the user confirms" could thereby be bypassed.

1. **Allowlist instead of denylist.** A bearer token is valid only on controllers with
   `@AcceptsAssistantToken()`; that is the MCP controller alone. Everywhere else the guard answers with
   403 before it looks up the token. A test records that the marker is present only there.
   `@ForbidAssistant()` remains as a second block.
2. **Registration only when signed in.** `allowUnauthenticatedClientRegistration` is off: only a signed-in
   user registers a client. Consequence: an MCP client that registers itself before sign-in
   (RFC 7591, which is how the usual assistants connect) no longer gets in this way.
   Instead, the user creates the access in the profile („Assistent verbinden“, "Connect assistant"): a public client
   (PKCE, no secret) with the assistant's callback address (Claude, ChatGPT or a custom one, https
   or loopback). The app shows the server address and client ID, which the user enters in the assistant.
3. **The assistant is its client ID.** Origin (`Kennzeichnung.herkunftClientId`,
   `vorschlagClientId`) and tasks (`AssistentAufgabe.clientId`) record the client ID. "Own
   entry" (undo, remove child or property, read own tasks, "you" in the read view)
   goes by it; the name a client gives itself is display only. Entries from before this
   change carry no ID and continue to go by the name.
4. **Tasks for the user** (`aufgabe_fuer_nutzer`): fixed types, at most 300 characters, no
   identifiers (IBAN, Steuer-ID), no links or web addresses, at most 20 open per year; in the app
   only as plain text with the assistant's name.

Deliberately not in this cut: an upper limit for tool calls and concurrent sessions; tasks
only from text templates. Booking drafts via MCP remain open (a booking is not a field value and
needs its own draft path).

## Amendment 5 (2026-11-21) — The assistant registers itself again

Amendment 4 no. 2 is withdrawn. With MCP it is usual that the user enters only the
server address in the assistant; the assistant reads the metadata (RFC 9728, RFC 8414), registers itself
(RFC 7591) and sends the user to sign in and grant access. There is no client secret (public
client, PKCE). Copying a client ID by hand is one step more than with other services.

1. `allowUnauthenticatedClientRegistration` is on again. A registration grants nothing: a token
   is only created after the user signs in and grants access, and applies only at the MCP endpoint (Amendment 4 no. 1).
2. **Limit:** at most 10 registrations per hour and address (`/oauth2/register`).
3. **Cleanup:** A self-registered client that no user has approved after 7 days is
   deleted (`oauth-client-sweep.ts`; runs with a registration, at most hourly per process).
4. „Assistent verbinden“ in the profile remains as a second path for assistants without their own registration;
   a client created there belongs to the account and is not cleaned up.

Not examined: Client ID Metadata Documents (the client ID is an address of the assistant, nothing
is stored) as a later replacement for registration.


## Amendment 6 (2026-11-21) — Booking drafts, comparisons, limit and Streamable HTTP

Closes #548 and #549 and takes up the points left open in Amendment 4 (booking drafts, upper limit).
Unchanged: the assistant writes only unconfirmed values or suggestions; the user decides in the app.

1. **Booking drafts are suggestions.** `buchung_entwerfen(taxYear, …)` takes the same details as
   `stage_booking_draft` of the in-app advisor and checks them the same way (`parseBookingDraft`, `checkBookingDraft`:
   chart of accounts, tax code, balance, finalization, year; without a book `NO_BOOK`). Because there is no
   card in the chat via MCP, the draft sits as an open suggestion on `buchung:<entwurf-id>.entry` with the assistant's
   origin (`fileProposal`); it appears under „Prüfen & bestätigen“ (Anlage EÜR) as a readable booking
   (date, text, document, total) and is only booked with „Übernehmen“ ("Apply") via the existing booking path
   (`decideProposal` → `applyDraft`); „Verwerfen“ ("Discard") leaves nothing behind. `buchungsentwuerfe_auflisten` shows only
   its own open drafts; the booking text is returned, as it is the user's own detail, not an identifier.
   Undoing works with `eintrag_zuruecknehmen` (form `buchung`, field `entry`); an applied booking
   can only be cancelled by the user. At most 25 open drafts per assistant and year; only the first business.
2. **Comparisons from the case data.** `veranlagung_vergleichen` calculates Zusammenveranlagung versus Einzelveranlagung with
   the core (`filingTypeComparison`) from the taxable income of the app estimate, split between both persons in the ratio of their
   income (an approximation, which the answer says; without church tax); without
   Person B or an estimate, it names the reason. `vorjahr_vergleichen` puts `schaetzung_aufschluesseln` of both
   years side by side, with the change in the main figures, the fields with a previous-year value that are now empty
   (only form and field names, only the user's own), and the number of children and rental properties.
3. **Limit:** at most 120 tool calls per user and minute (sliding window, across all of the user's sessions and
   clients) and at most 3 open SSE sessions per user (`MCP_LIMITS` in `mcp-rate-limit.ts`).
   Beyond that, a tool answers with `RATE_LIMITED: … in X Sekunden wieder`, and a further SSE session with 429.
   The first rejected call of a block and every rejected session go into the audit log. The counter lives
   in the process memory, without a database: **it applies per instance**; with several instances (ADR-0053)
   a user can do correspondingly more. A shared counter (e.g. Redis) would be the next step.
4. **Streamable HTTP.** Besides the old SSE transport (`GET /mcp/sse`, `POST /mcp/messages`) there is
   `POST /mcp` (MCP Streamable HTTP, stateless: a new server per request, JSON responses, `GET`/`DELETE`
   with 405). Same guard, `@AcceptsAssistantToken()`, 401 with `WWW-Authenticate` and the same limit. Since
   nothing is held between requests, any instance answers any request. The **SSE sessions stay
   in the memory of one instance**: a `POST /mcp/messages` that lands on another one does not find its session
   (404); clients should use `/mcp`.
5. **Two resources, one endpoint.** `/mcp` is a separate OAuth resource (metadata under
   `/.well-known/oauth-protected-resource/mcp` with `resource …/mcp`), because a client checks that the resource
   matches its server address (`/mcp/sse` does not match `/mcp`). Both resources are created on the first
   OAuth call; the guard accepts tokens with audience `…/mcp/sse` (all issued so far) and
   `…/mcp` on both transports. The metadata of `/mcp/sse` remains unchanged.


## Amendment 7 (2026-11-22) — Registration limit for hosted assistants

Amends Amendment 5 no. 2. A hosted assistant such as Claude.ai registers itself from its own
servers, not from the user's device. All its users therefore share a few addresses; with
10 registrations per hour and address, from the eleventh user in an hour nobody would get in any more.

1. **Limit:** at most 100 registrations per 10 minutes and address (`OAUTH_REGISTRATION_RATE_LIMIT`).
2. This remains justifiable because a registration grants nothing (Amendment 5 no. 1) and a never-
   approved client is deleted after 7 days (Amendment 5 no. 3). The limit only protects the table.
   So that the cleanup keeps up, one run checks up to 20 pages of 200 clients (4,000 instead of 200), the
   oldest first, and skips retained clients instead of getting stuck on them.
3. Open: the limit counts per process in memory, like the other better-auth limits; with several
   instances it multiplies. A shared store (Redis) comes with #292.

## Amendment 9 (2026-11-23) — Limits an assistant could walk around

Four gaps from a code review of the MCP server. None let an assistant read or write what it was not
granted; each let one that was granted access do more than intended. (Amendment 8, the consent screen,
is in a pull request of its own.)

1. **Children:** `kind_anlegen` had no upper bound, unlike `vermietung_anlegen` (10 objects). An
   assistant now creates a child only while the tax year holds fewer than 12
   (`MAX_CHILDREN_BY_ASSISTANT`); more are added by the user in the app. The repository counts and
   inserts under one advisory lock per account and year, so calls arriving together cannot pass the cap
   (the same lock also keeps their sequence numbers apart).
2. **SSE session and client:** `POST /mcp/messages` checked that a session belongs to the caller's
   user, not to the caller's client. The server behind a session carries the scopes of the client
   that opened it, so another assistant of the same user, granted less, could have acted through it
   with the session id. A message from another client is now refused with 403.
3. **Checkout links:** every `zahllink_anfordern` creates a checkout session at the payment provider,
   bounded only by the 120 tool calls per minute. Now at most 5 per hour and account
   (`MCP_CHECKOUT_LINK_LIMIT`), refused before the provider is asked.
4. **Limits across instances:** amends Amendment 6. The tool-call window stays in the process and
   refuses a flood without a round trip; a call it lets through is also counted in the shared
   rate-limit storage (ADR-0106), so several instances hold one limit together. The checkout-link limit
   counts there too. This takes effect only where that storage has Redis (#292); without it the storage
   counts per process, as before. The limit of open SSE sessions stays per process, because the
   sessions themselves live in one process.
5. Cost: with Redis, every tool call that passes the process window adds one round trip to it, and the
   storage opens a connection per call. If Redis does not answer, the call waits for the storage's
   timeout (400 ms) and is then counted in the process.
6. Known bound: the shared storage counts in fixed windows (a key expires one window after its first
   increment), as it does for the sign-in limits of ADR-0106. Around a window boundary several instances
   together can let through up to twice the limit within one rolling window. Each process still holds its
   own sliding window. The limits bound abuse, not billing, so this is accepted here rather than giving
   the MCP its own counter.
