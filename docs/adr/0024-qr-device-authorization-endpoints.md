# ADR-0024 — QR device authorization: our endpoints in front of better-auth's plugin

- **Status:** Accepted
- **Date:** 2026-08-01
- **Deciders:** Stakeholder (NexusHero) on QR placement, approval model and geo-IP; Musti (lead) on
  the endpoint seam. **Two stakeholder corrections on 2026-08-01 are recorded in *Decision history*
  below rather than smoothed away.**
- **Builds on** [ADR-0009](0009-better-auth-as-auth-server.md) (better-auth is the auth server),
  [ADR-0012](0012-session-guard-coexistence-and-guest-upgrade.md) (mounting and guard coexistence),
  [ADR-0008](0008-profile-persistence-encryption.md) (nothing sensitive in client storage),
  [ADR-0011](0011-cors-credentialed-cross-origin.md) (`SameSite=None; Secure`),
  [ADR-0021](0021-controls-are-proven-by-breaking-them.md) (a control is proven by breaking it).
- **Context tags:** security, auth, DSGVO, new data dependency
- **Introduced by:** REQ-014 / `steuereule#238`, PR `steuereule#239`

## Context

REQ-014 lets someone sign in on a desktop by scanning a QR code with an already-signed-in phone.
`better-auth@1.6.24` ships a `device-authorization` plugin that implements RFC 8628. Read against the
**installed** dist (`node_modules/.pnpm/better-auth@1.6.24_.../dist/`), not the type surface, it
implements the protocol correctly and **three findings block using it as the browser-facing
surface**:

1. **`/device/token` sets no session cookie.** It calls `ctx.context.setNewSession(...)`
   (`routes.mjs:271`), a bare field assignment (`context/create-context.mjs:190-192`); the function
   that writes `Set-Cookie` is `setSessionCookie` (`cookies/index.mjs:122-134`) and the plugin never
   calls it. What comes back is `access_token` in the JSON body (`routes.mjs:280`). A browser client
   would have to hold that in JS-reachable storage — which ADR-0008/ADR-0012 forbid outright.
2. **No request context is stored to verify against.** The `deviceCode` model has nine fields, none of
   them a user-agent, an IP or a request timestamp (`plugins/device-authorization/schema.mjs:3-38`),
   and the plugin's `schema` option only *renames* fields (`index.d.mts:24-49`) — it cannot add any.
   Match verification ("does this look like your request?") has no data to stand on.
3. **`GET /device` is a state-changing request with the origin check disabled.** It writes `userId`
   onto the pending record (`routes.mjs:344-364`) — the *claim* — and `/device/approve` refuses any
   code that has not been claimed (`routes.mjs:422-425`). But `originCheckMiddleware` returns
   immediately for `GET` (`api/middlewares/origin-check.mjs:43`), and our session cookie is
   `SameSite=None; Secure`. So any page on the internet could bind a pending code to a signed-in
   visitor's account with a credentialed cross-origin `fetch`. It cannot *approve* — approve is a
   POST and origin-checked — but "an attacker chooses whose account a code is bound to" is not a
   reachable state we accept in an auth slice.

Findings 1 and 3 are the load-bearing ones: each on its own is sufficient to keep the plugin's HTTP
surface away from the browser.

### Decision history — two stakeholder corrections, same day

Kept visible because the second reverses the first, and a reader a year from now should see that
rather than a tidy single line.

| | |
|---|---|
| **Original** | Match verification ("is this code on your screen?" + browser/OS/region/time) **and** two session-scope buttons ("nur jetzt" / "diesem Gerät vertrauen"). QR gated behind a "Mit Handy anmelden" tap. |
| **First correction** | Match verification **and** session scope both revoked (one-tap approval); QR placement reversed to **open on the Login screen**, code minted on page load. |
| **Second correction** | Match verification **reinstated**. Session scope **stays revoked**. Open QR placement **unaffected**. |

**Net state: match verification is in, dual session scope is out, the QR is open on Login and minted
at page load.** A fourth finding in the original refinement — that the plugin hard-codes one session
lifetime with no way to pass `dontRememberMe` (`routes.mjs:266`,
`db/internal-adapter.mjs:162,185`) — **lost its occasion** when session scope was revoked, and is no
longer a reason for anything here. It survives only as the trap noted under *Consequences*, because
it is exactly what a future reinstatement would walk into.

## Decision

**The plugin's HTTP routes are switched off; the browser talks only to our endpoints.** Same shape as
the `UserContextGuard` seam (ADR-0007/0012): **better-auth stays the mechanism, our API owns the
surface.**

- The plugin's five routes are disabled with better-auth's own `disabledPaths`
  (`DEVICE_AUTHORIZATION_DISABLED_PATHS`, enforced in the router's `onRequest`,
  `api/index.mjs:164-166`). Server-side `auth.api.*` calls still work — `disabledPaths` gates HTTP
  routing only. That is what makes the whole wrapper possible.
- Four Nest endpoints instead, behind the existing CORS/origin machinery:

  | Endpoint | Caller | What it does |
  |---|---|---|
  | `POST /v1/device/code` | desktop | `auth.api.deviceCode(...)`, then stamps the **desktop's** UA/IP/region/`requestedAt` onto the row just created. Unguarded by design: the desktop has no identity yet. |
  | `GET /v1/device/pending?user_code=` | phone | Returns the match-verification payload. Claims the code via `auth.api.deviceVerify({ headers })` **server-side**, so finding 3's CSRF-on-`GET` path is never reachable from a browser. |
  | `POST /v1/device/approve` | phone | `auth.api.deviceApprove(...)`. One tap, no scope choice. |
  | `POST /v1/device/token` | desktop | `auth.api.deviceToken({ headers: <the desktop's headers> })`, then sets the httpOnly session cookie itself. |

- **Four extra columns** (`requestUserAgent`, `requestIp`, `requestRegion`, `requestedAt`) are ours,
  nullable and additive on the `DeviceCode` model. The plugin never reads or writes them, so there is
  nothing to conflict with — which is only true *because* its own routes are off. **`grantScope` is
  not among them**: it existed only to record the session-scope choice, and that decision is revoked.
- **One fixed session lifetime**, identical to a password login. There is no scope choice to apply,
  store, or prove.
- **Header forwarding is load-bearing, not incidental.** `createSession` reads `ipAddress`/`userAgent`
  off the *current* request context (`db/internal-adapter.mjs:163-166,177-178`). Called from Nest, the
  desktop's headers must be passed through, or every QR-issued session lands in the device list with
  a blank device — the exact field the device list exists to show.

### Match verification is the security control, not reassurance copy

The phone does not ask "Approve?". It asks "is this code on your screen?", shows the requesting
browser, OS, region and time, and carries a persistent statement that a code received by message or
link is never approved here.

**Why that statement is a control:** claiming a code binds it to *the claimant's* account, so a
successful guess — or a code talked into someone's hands — followed by an approval logs the victim's
**desktop into the attacker's account**. That is a **session-fixation shape, not an account
takeover**. The user refusing is not protecting their own account; they are refusing to have someone
else's session installed on their machine. Which is precisely why the copy is asserted explicitly by
test rather than left to a snapshot.

### QR placement and what it costs

The QR sits open in its own column on the Login screen and the code is minted **on page load**, not
behind a tap.

**Named consequence, not a silent omission: every Login page view now mints a `DeviceCode` row.** The
"zero requests before a deliberate tap" property the gated placement gave for free is deliberately
given up.

**What actually bounds it, stated precisely because the ticket's own summary overstates it:**

- `expiresIn: '2m'` (not the plugin's 30m default, `index.mjs:19`) bounds how many codes are pending
  at once — the only quantity a guessing attack cares about. 15× fewer live codes at no UX cost.
- **The `customRules['/device']` entry does *not* bound this endpoint.** That rule is better-auth's
  *router-bound* limiter; `/device` is one of the five paths `disabledPaths` 404s before the limiter
  is consulted, and it never fires for an in-process `auth.api.*` call either — the same gap
  `verify-password-rate-limit.ts` already found for `/verify-password`. The rule is kept because it is
  harmless and keeps the stated config real, but **anything describing it as the protection for
  `/v1/device/*` is wrong.**
- **The code-guessing surface is `GET /v1/device/pending`, and it carries its own DB-backed limiter**
  (`device-pending-rate-limit.ts`, window 60s / max 10 per IP). Against the default
  `generateUserCode`'s 40 bits — 8 characters from a 32-symbol charset (`routes.mjs:9,541-544`),
  exactly uniform since 256/32 = 8 with no modulo bias, `I`/`O`/`0`/`1` already excluded — one
  guessing IP gets 5,256,000 attempts/year against a space of 2⁴⁰.

  **The quantity that matters is `N`, the number of *victim-minted* codes pending at once** — at
  100,000 organic page views/day, `N ≈ 139` and a single guessing IP needs ~1,500 years; 100
  rotating IPs, ~15 years. **`N` counts only codes minted by real users:** a code the attacker
  minted points at the attacker's own desktop, so guessing it buys nothing, and flooding the table
  therefore does **not** erode this margin. **Rotating source IPs on `/v1/device/pending` is the
  only lever that moves it**, and it is the one to watch.

  *(An earlier revision of this ADR illustrated the bound with `N = 100,000` — a number that needs
  833 login page views per second, 72 million a day. It was a deliberately absurd ceiling and it was
  read as a baseline. Replaced with loads this app could actually see.)*
- **`POST /v1/device/code` carries a per-IP DB-backed limiter** (window 60s / max 10, the
  `db-rate-limit.ts` shape). Its justification is **write amplification, not entropy**: unguarded, an
  unauthenticated caller sustained a measured 305 rows/s — ~14.9 GB/day of rows that nothing deletes
  — against the database holding every user's encrypted tax data. The limiter puts one source at
  ~8.2 MB/day, so matching that single process takes ~1,830 distinct IPs. It keys on `request.ip`,
  which makes the `trustProxy` follow-up below **load-bearing**: behind a proxy this collapses onto
  one key and throttles everyone.

`generateUserCode` stays at its default: lengthening it costs the human reading it off a screen, and
the two levers above are what move the risk.

### Geo-IP resolution (stakeholder ruling, 2026-08-01)

Resolving an IP to a place is **processing of personal data**, not a library choice. The lead
recommended rendering only what an edge header provides and "Region unbekannt" otherwise; the
stakeholder ruled a real geo-IP source in. **One resolver, two consumers** — the approval screen
(match verification) and the device list — each proving the same two branches independently, because
neither rendering path can stand in for the other.

Four things make it auditable:

| | |
|---|---|
| **Source** | **DB-IP IP-to-Country Lite** — country granularity only. |
| **Licence** | **CC BY 4.0 — see "The licence line is unverified" below. This row has not been confirmed against the source and must not be read as if it had been.** MaxMind GeoLite2 was the obvious alternative and is **not** taken: its EULA carries a 30-day update-or-delete obligation, i.e. an ongoing duty attached to a dataset we would be self-hosting. |
| **Where it lives** | **Self-hosted, in our own EU deployment**, fetched at **build time and pinned by SHA-256 checksum** (`apps/api/scripts/fetch-geoip-database.ts`; the checksum is verified *before* anything is written, so a mismatch can never silently become "the new database"). **No user IP ever leaves our infrastructure.** A third-party lookup API (ip-api, ipinfo, …) is **explicitly rejected**: it would make every approval screen an outbound transfer of a user's IP to a processor we have no agreement with, quite possibly outside the EU. That is a worse trade than the one this feature is trying to make. |
| **Who keeps it current** | A scheduled refresh invokes the fetch script explicitly — deliberately **not** `postinstall`, so a re-fetch is never triggered on a schedule nobody chose. **Staleness fails loudly, not silently:** a database older than its refresh interval resolves to `unknown` rather than a stale answer. That is a control, so ADR-0021 applies — break it, watch **both** screens fall back, restore. |

**Granularity is country-level, deliberately.** The screen's job is "does this look like you?", which a
country answers. City-level would be more personal data for no added verification value — data
minimisation, Art. 5(1)(c).

**`unknown` → "Region unbekannt" is a designed state, not a leftover.** Private ranges, CI, local dev,
an unlisted block, a stale database: the resolver returns `unknown`, never a guess, never a throw
(`apps/api/src/device/region/region-resolver.ts`). A screen that *claims* a region because a database
guessed one is worse than a screen that admits it cannot tell — on a surface whose entire purpose is
helping someone spot a request that is not theirs. A missing geo-IP database must never be the reason
`/v1/device/code` fails.

#### The licence line is unverified — deliberately left visible

`db-ip.com` **could not be reached from the environment this ADR was written in.** The outbound proxy
recorded, for host `db-ip.com:443`:

```
2026-08-01T07:29:49.461Z  connect_rejected  "gateway answered 403 to CONNECT"  db-ip.com:443
```

**That is a property of this environment's network policy, not of DB-IP.** It says nothing about the
source's availability, terms, or suitability.

Three consequences, none of them smoothed over:

1. **The CC BY 4.0 row above is a from-memory citation by the lead, restated by the implementer, and
   confirmed by neither** against DB-IP's current terms. It stands as the working assumption and as an
   **open item**, not as a checked fact.
2. **`fetch-geoip-database.ts` must not be run against a real URL until someone with network access
   has fetched the source page by hand and read the licence there.** `GEOIP_SOURCE_URL` and
   `GEOIP_SOURCE_SHA256` therefore have **no defaults** and the script refuses to run without them —
   there is no pinned checksum to fall back to, because none was ever fetched to pin.
3. The licence string is **passed into** `fetchGeoIpDatabase`, not hard-coded, so correcting it never
   means editing logic to fix a string.

The attribution carried in the Datenschutzerklärung inherits this open item. Whoever closes it
updates this row, the Datenschutz copy, and the script header together.

## Consequences

**Positive**

- better-auth stays the mechanism and we own the surface — the same seam as `UserContextGuard`, not a
  second identity authority.
- All three findings are neutralised at the seam rather than patched: no browser-reachable Bearer
  token, a place to store match-verification context, and no CSRF-on-`GET` claim path.
- One resolver serves both region consumers, so "Region unbekannt" cannot come to mean two different
  things on two screens.

**Negative / accepted**

- **A better-auth upgrade must re-check three files, and one of them fails silently.** Every finding
  above is read off the installed dist of one version (`1.6.24`), and the wrapper is built to
  compensate for precisely those behaviours.

  | File | What an upgrade could change | How we would find out |
  |---|---|---|
  | `plugins/device-authorization/routes.mjs` | the behaviours findings 1–3 rest on | acceptance tests go red |
  | `api/middlewares/origin-check.mjs` | the `GET`-skips-origin-check behaviour | acceptance tests go red |
  | `better-call`'s `dist/crypto.mjs` (`signCookieValue`) | the **signed-cookie wire format** | **nothing, unless a test round-trips it** |

  The third is the dangerous one. Because `/device/token` never sets a cookie, this app writes the
  session cookie itself in better-auth's signed format (`apps/api/src/device/session-cookie.ts`).
  A silent format change there does not break a build — it produces a **wrong signature** that a later
  `auth.api.getSession()` rejects. Per ADR-0021 the protection must be a test that breaks when the
  library's format moves, not a comment asserting the format: the round-trip through a **real**
  better-auth instance in `test/acceptance/req-014-device-approve-token.integration.test.ts` is that
  test, and it counts only while it runs in CI against the real dependency (ADR-0010).
  **This re-check is the price of the wrapper**, written here so the next person knows they are
  paying it rather than discovering it.

- **`POST /v1/device/code` is unauthenticated and now fires on every Login page view**, so the mint is
  a page-view-rate event rather than a deliberate one. Each call writes a `DeviceCode` row of
  ~567 bytes (measured over 1,000 real rows via `pg_total_relation_size`). That is why it carries its
  own limiter — see above.
- **Nothing deletes expired rows.** There is no sweeper (`@nestjs/schedule` is not a dependency), and
  the plugin's own lazy delete only fires when something polls a specific `device_code` after
  expiry — so abandoned page-view mints are permanent. `expiresIn: '2m'` bounds how many codes are
  *live*; it does not bound how many rows accumulate. With minting limited this is ~170 MB/month at
  10,000 page views/day, which is why it is **not** treated as an emergency — but the cleanup
  mechanism is a genuine open decision (in-process scheduler vs. external cron vs. delete-on-mint),
  and adopting a scheduler is an architecture call, not a slice call. Tracked separately, on purpose.
- **The revoked session-scope decision left a live trap for anyone who reinstates it.** better-auth's
  `getSession()` **silently extends a shortened session back to the full configured lifetime on the
  next read** unless a second `dontRememberToken` cookie is also set. Found by booting a real server,
  not by reading the types. Harmless today — there is one fixed lifetime — but a future "nur jetzt"
  button that sets only `expiresAt` would appear to work and then quietly stop working after the first
  request. One line here is cheaper than rediscovering it.
- **A new data dependency with an open licence question** enters the deployment — see above. It is the
  first dataset this project self-hosts.
- **`request.ip` is the raw socket peer.** No `trustProxy` is configured, so behind a reverse proxy the
  address seen is the proxy's — which also makes the per-IP limiter on `/v1/device/pending` collapse
  onto a single key. The deployed demo needs `trustProxy` plus a trusted `X-Forwarded-For` reader. Out
  of scope for REQ-014 and tracked as a deployment follow-up — named here rather than presented as
  solved. Proxy-shaped addresses still resolve safely: the resolver treats anything private or
  unroutable as `unknown`.

## Not decided here

**A Verarbeitungsverzeichnis (Art. 30 records of processing) does not exist in this repository and is
not created by this slice.** Searching `docs/`, `apps/` and `packages/` for it returns only ADR-0013
(`:23,42,46,205`), `schema.prisma:40` and `arc42/README.md:113,159` — every one of those is about the
**audit log serving an Art. 30 accountability function**, not a controller's register of processing
activities. There is no such document to add a row to. Creating one is a legal-document decision and
is **not** invented inside a feature slice: flagged to the stakeholder as its own call.

What does ride this slice regardless is the **Datenschutzerklärung** — both the new geo-IP processing
*and* the session `ipAddress`/`userAgent` becoming user-visible.

**`qrcode-generator` was adopted without a stakeholder ruling, deliberately.** The feature is
impossible without a QR encoder, and this one is a leaf: MIT, **zero dependencies** (verified against
the installed `2.0.4` manifest), pure JS, no architectural reach, replaceable in an afternoon. It
shapes nothing downstream, which is the test the "a new dependency is a stakeholder call" guardrail
actually exists to apply. Recorded here and on the tech radar so the adoption is visible rather than
invisible — that is the difference between *not escalated* and *casual*.
