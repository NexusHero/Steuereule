# `e2e/harness/`

The importable stack/browser primitives every `e2e/*.mjs` gate script needs — extracted so the
recipe for "stand the real stack up and drive it with a real browser" lives in one place a script
can `import`, instead of being re-typed from `ci.yml`'s YAML (or from a previous script's
already-slightly-different copy) each time a new gate is written. See `stack.mjs`'s and
`browser.mjs`'s own header comments for the *why* behind each individual instrument; this file is
the environment truths that keep getting silently re-derived, written down once.

## Environment truths

- **Node 24, not whatever's on your machine.** `.github/workflows/ci.yml` pins
  `actions/setup-node@v5` to `node-version: 24` in every job that runs these scripts. A green run
  under a different local Node (22, in this session's own sandbox) is a false positive of exactly
  the shape Slice-1's retro named: Node 22 accepted a signal shape Node 24's bundled undici
  rejects (`apps/mobile-web/src/test-setup.ts`'s own `AbortSignal` comment documents the same
  class on the frontend test side). Every report this harness's scripts produce should name the
  Node version the run actually used — `node --version` — not assume it matches CI's.

- **The container registry can be blocked from this environment.** `docker compose up -d
  postgres` has, in past sessions, hung on an unreachable image pull with no visible error short
  of a timeout. `stack.mjs`'s `startPostgres` tries docker first and falls back to a native
  `postgres`/`initdb`/`pg_ctl` binary (present on GitHub's
  `ubuntu-latest` runner image, and on Debian/Ubuntu locally via the `postgresql` apt package) if
  docker doesn't reach a healthy `pg_isready` within 30s. Both paths produce the identical
  `DATABASE_URL` shape, so nothing downstream needs to know which one ran.

  **Now exercised for real, in Salih's #239 T1 re-run — with a real gap found, not yet fixed
  here.** That session's docker daemon could not be started at all (sandboxed, `ulimit`-restricted
  environment), and its own OS user was root — `initdb`/`pg_ctl` both refuse outright to run as
  root ("cannot be run as root", a real, unpatched Postgres restriction, not a bug in this file).
  GitHub's own `ubuntu-latest` runner executes as the unprivileged `runner` user, so this never
  bites CI — but ANY root-uid environment (a root-default container image, some sandboxes) hits it
  today with no accommodation in `startPostgres` below. Worked around **locally, out of band, not
  committed here** (a `sudo -u postgres` detour) — see that PR's test-report comment for the exact
  patch. Fixing this in the committed module — detect `process.getuid?.() === 0` and re-exec the
  native-binary steps as an unprivileged user — is real, scoped follow-up work, deliberately not
  folded into this pass so the fix can be reviewed on its own.

  **Refined in Salih's #274 pass (2026-08-05): "the daemon could not be started" was this
  session's own gap, not a permanent one — `dockerd` DOES start as root in this class of sandbox
  (confirmed directly: `nohup dockerd &`, then `docker info` answers). The real, still-open
  blocker is the registry PULL itself, not the daemon: `docker pull`/`docker buildx build` both
  fail with `403 Forbidden` on the very first blob request, and the agent proxy's own status
  endpoint (`curl "$HTTPS_PROXY/__agentproxy/status"`) names the cause precisely —
  `recentRelayFailures` shows `connect_rejected` / `gateway answered 403 to CONNECT (policy denial
  or upstream failure)` against `production.cloudfront.docker.com:443`, Docker Hub's own blob CDN.
  This blocks pulling ANY image, for ANY platform (confirmed trying `linux/arm64` specifically,
  investigating #274's own arm64-portability question for the stakeholder's Mac — blocked before
  either architecture could even be attempted). `/root/.ccr/README.md`'s own "docker build /
  docker run" section covers network access FROM INSIDE a build/container; it does not cover this
  — the base-image pull itself, at the daemon's own registry client, before any container starts.
  Check that status endpoint first in any future session that sees a `docker pull`/`compose up`
  hang or a 403 — it answers in one call what used to take a timeout to even suspect.**

- **`expo export --platform web --clear` — the `--clear` is load-bearing, not defensive.**
  Metro's bundler cache survives between exports; a second `expo export` with a different
  `EXPO_PUBLIC_API_BASE_URL` and no `--clear` can silently ship the STALE baked-in origin. The
  resulting failure mode (every API call goes to the wrong origin) looks exactly like a CORS
  misconfiguration and wastes real debugging time being investigated as one before someone
  remembers the cache. `stack.mjs`'s `startWeb` always passes `--clear`.

- **The installed package is `playwright-core`, not `playwright`.** `e2e/package.json`'s only
  devDependency is `playwright-core` (no test-runner needed — these are plain Node scripts, not a
  Playwright Test suite). Its registered CLI binary is named `playwright-core`, so `pnpm exec
  playwright-core install chromium --with-deps` is the right invocation; `pnpm exec playwright
  ...` fails with "Command \"playwright\" not found" even though the package that provides the
  browser-install logic is present (this bit CI once — see `ci.yml`'s own comment on that step).
  **CI's own runner starts with nothing cached beyond `actions/cache`'s `~/.cache/ms-playwright`
  entry, so that install step is genuinely load-bearing there — do not read the next line as
  overriding it for CI.** Corrected here (this line was wrong in a way that cost two prior
  sessions a capability they already had): in this agent sandbox specifically, a real,
  already-downloaded Chromium sits at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` — set that
  env var and `chromium.launch()` starts in ~90ms with **no** `playwright-core install` step
  needed at all (confirmed directly: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node -e
  "require('playwright-core').chromium.launch({headless:true})..."`, 87ms, Salih's #295-occasion
  return-visit gate, 2026-08-06). A prior version of this bullet said nothing about this
  shortcut, so each new session re-ran (or worse, assumed it needed and couldn't run) the full
  install step against this environment's registry-blocked network before finding the
  preinstalled binary.

- **The `RateLimit` table is never truncated to make a gate pass.** `db-rate-limit.ts`'s rolling
  window (keyed on `lastRequest`, not a quota) is a real REQ-010 control; several scripts already
  document (`visibility-refetch.mjs`, `banner-ds-qa.mjs`) that clearing it was tried once and
  reverted as the exact inversion this project exists to prevent. Any script that shares a CI job
  with others must PACE itself against the real bucket state, never reset it. Two db-rate-limit
  buckets a new device-authorization script must specifically pace against: `device-code:<ip>`
  (`apps/api/src/device/device-code-rate-limit.ts`, window 60s/max 10) and `device-pending:<ip>`
  (`device-pending-rate-limit.ts`, same shape) — both keyed by Fastify's raw `request.ip`, which
  this job cannot resolve to a real per-caller address any more than better-auth's own limiter
  can, so every script in the job shares one bucket per path exactly like the `/sign-up`/`/sign-in`
  case `visibility-refetch.mjs`'s header already documents. **Also true, easy to miss:** the
  `LoginScreen`'s QR column mints a `device-code:*` row on every render at the `m`/`l` breakpoints
  (Decision 3a — no tap required), so any earlier script in the same job that renders LoginScreen
  wide (`breakpoint-layout.mjs`'s own breakpoint sweep, for one) has already spent some of that
  bucket before a device-authorization script gets to run — one more reason such a script must run
  LAST in its job and read the bucket's live state rather than assume it starts empty.

## `stack.mjs`

`startStack()` returns `{ apiOrigin, webOrigin, sql, stop }`. Two modes, chosen automatically by
whether `API_ORIGIN`/`WEB_ORIGIN`/`DATABASE_URL` are already set:

- **ATTACH** (CI's normal shape): confirms both origins actually answer (the same `httpReachable`
  probes BOOT runs on what it just started — Musti's #263 review, F1: the two modes must make the
  identical claim about the return value, not "checked" in one and "trusted" in the other), then
  reuses the stack the calling job already booted; `stop()` is a no-op. This is what every
  existing `e2e/*.mjs` script already assumes via `requireEnv(...)` — `stack.mjs` centralises
  that assumption rather than replacing how those scripts work today. Shorter timeout than BOOT's
  own probes (10s, not 30s): nothing is starting in this mode, so a slow answer means a hung
  service, not a cold start — waiting the full 30s would only delay the diagnosis.
- **BOOT** (local dev, or `startStack({ boot: true })` explicitly): stands the whole stack up
  itself — Postgres (docker, native fallback), `prisma migrate deploy`, build + boot the compiled
  API, `expo export --clear`, serve the bundle on a second origin (reusing
  `e2e/cross-origin/static-server.mjs`, not a second copy of it). `stop()` tears down exactly what
  it started, in reverse order, PID/process-scoped only (never a blanket kill — #114's rule).

Run it standalone for a one-command local stack a contributor can click through by hand:

```
node e2e/harness/stack.mjs
```

leaves Postgres/the API/the web bundle running and prints both origins; tear down yourself
afterwards (`docker compose down`, or kill the printed PIDs) — it deliberately does not call its
own `stop()` when run this way, matching `docker-compose.yml`'s detached-by-default local shape.

## `browser.mjs`

`BREAKPOINTS` (the one canonical 375/768/1280 set — every prior script defined its own slightly
different copy; new scripts import this instead), `launchBrowser`/`closeBrowser`,
`newContextAtBreakpoint` (a fresh browser **context**, never a second page — see its own comment
for why that distinction is load-bearing for any two-actor flow), `newReducedMotionContext`,
`sweepBreakpoints`, `guardAgainst429`, `saveNamedScreenshot`, and two new instruments with no
prior committed equivalent — both the same move, applied to two different surfaces: **measure
the effect, not the intent.** A component's props, its CSS class, its `getComputedStyle` report,
even a green unit test, are all statements of what the code *intends* to happen — none of them
is a statement that it *did*. Both instruments below read the thing itself (real animation
frames, a real decoded pixel) instead of trusting an adjacent signal that a broken implementation
can still emit correctly:

- `sampleComputedStyleOverFrames` — proves an animation actually PROGRESSES across real
  `requestAnimationFrame` frames, not just that its final computed style is correct. What would
  have caught the inert-splash-entrance class of bug: a single-sample style read stays green
  whether the animation ran once or never ran at all — the intent (the CSS/animation config) was
  correct, the effect (motion on screen) wasn't.
- `probeColourAtPoint` — reads the actual rendered PIXEL at a page coordinate (a real screenshot
  crop, decoded via this file's own dependency-free PNG reader), not `getComputedStyle`'s report
  of what the stylesheet *says* should be painted. What would have caught the solid-green-eye
  class of bug: a gradient stop that never resolved, or a stuck transition, can leave a
  "correct" computed `fill` (the intent) sitting next to a visibly wrong painted pixel (the
  effect) — `getComputedStyle` would have called that green.

Both were originally exercised by `e2e/device/device-authorization.mjs`'s own `l`-breakpoint
Context A, which used to render the QR column's own owl-entrance animation alongside the real
approve button — a real caller, not a synthetic self-test (Musti's #263 review, F2: an instrument
with no caller is unproven that it's needed at all — the same "generated, correct, and called by
nothing" shape that made the QR-login desktop poll go dead). `probeColourAtPoint` still lives
there today, against the approve button's own known fill (`t.color.funke`) AND a deliberately
wrong coordinate (the page background), calibrated in both directions so a device-pixel-ratio-
shifted or hard-coded-return crop can't pass by reading the same value everywhere.

**`sampleComputedStyleOverFrames`/`newReducedMotionContext` lost that caller for a real reason
(#283/C3, landed in #298): the QR column's owl was dropped entirely** — `AuthGeraete.jsx`'s own DS
reference puts a static brand mark inside the QR pattern instead, no animation at all — so
`device-authorization.mjs`'s `assertOwlEntranceOpacity` had nothing left to calibrate against and
was retired with it (`ede1749`), not weakened. That reopened exactly the F2 gap it had closed: an
instrument with no real caller.

**Repaired, not left orphaned (Musti's #300 review, F10/G1):** `session/return-visit.mjs`'s Row G
is now these two instruments' one real caller, sampling SplashScreen's own independent entrance
animation instead — `expectProgress: true` on a genuine load, `expectProgress: false` under
`newReducedMotionContext`, the identical both-directions shape `assertOwlEntranceOpacity` used.
SplashScreen's entrance was never the hook the QR column borrowed (its own inline `Animated`
values, confirmed directly, not assumed — see `device-authorization.mjs`'s own header for the
correction on that point) and isn't affected by any Login-screen redesign, so this caller is
durable in a way the one it replaces stopped being. An instrument proven on only the "it moved"
half is unproven that it can tell a positive from a negative — Row G proves both, the same
standard the original caller set.

## `rate-limit.mjs`

`fail`, `readBucketByExactKey`, `readBucketByPrefix`, `waitForBucketHeadroom` — the "read the real
`RateLimit` row, never truncate it" discipline every gate that shares CI's `Browser gates` job
must follow (see "The `RateLimit` table is never truncated..." above). Extracted after Musti's
#300 review, G2: `device-authorization.mjs` and `session/return-visit.mjs` had each grown a
byte-identical copy of these five functions — not a style nit, since they encode a REQ-010
control's own policy (bucket-key shapes, and above all the never-truncate rule), and two copies of
a control are two things that can quietly drift apart. Both scripts migrated onto this one
canonical copy in the same change that introduced it — see this module's own header for why a
new file growing a second copy was never what the "Not done in this pass" note below licensed.
`waitForBucketHeadroom`'s `scriptTag` parameter is what lets two self-pacing scripts share one CI
job's log without either needing its own copy just to get its own log prefix.

## Not done in this pass

- `ci.yml`'s own remaining steps are **not** rewired to call `stack.mjs`/`browser.mjs` yet (the
  `Browser gates` job's device-authorization/return-visit steps already attach via `stack.mjs`'s
  ATTACH mode — that part is done; the job's own boot/serve steps above them are still hand-typed
  bash). That is a real, low-risk follow-up (each already-green job's remaining bash steps get
  replaced by one script import, one job at a time, each proven green again before the next),
  deliberately left out of the pass that introduces the module those steps would import —
  rewiring five working CI jobs and introducing the thing they'd import are two different amounts
  of blast radius, and mixing them would make a revert of either one harder than it needs to be.
- `visibility-refetch.mjs`'s own `sql()` and `banner-ds-qa.mjs`'s own `guardAgainst429` are
  **not** migrated to import the canonical versions here (the rate-limit helpers above ARE now
  migrated, on both `device-authorization.mjs` and `session/return-visit.mjs` — see
  `rate-limit.mjs`'s own section). Same reasoning as always for what's left: each is a small,
  separate, easy-to-review diff once a script already needs to change for another reason. What
  this note does **not** license, and never did (Musti's #300 review, G2): a **new** script
  growing its own copy of something a shared module already provides — that is the moment to
  import or extract, not the moment to note the duplication and move on.
