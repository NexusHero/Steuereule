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

- **ATTACH** (CI's normal shape): reuses the stack the calling job already booted; `stop()` is a
  no-op. This is what every existing `e2e/*.mjs` script already assumes via `requireEnv(...)` —
  `stack.mjs` centralises that assumption rather than replacing how those scripts work today.
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

## Not done in this pass

- `ci.yml`'s own steps are **not** rewired to call `stack.mjs`/`browser.mjs` yet. That is a
  real, low-risk follow-up (each already-green job's bash steps get replaced by one script
  import, one job at a time, each proven green again before the next), deliberately left out of
  the pass that introduces the module those steps would import — rewiring five working CI jobs
  and introducing the thing they'd import are two different amounts of blast radius, and mixing
  them would make a revert of either one harder than it needs to be.
- Existing scripts (`visibility-refetch.mjs`'s own `sql()`, `banner-ds-qa.mjs`'s own
  `guardAgainst429`) are **not** migrated to import the canonical versions here. Same reasoning —
  each is a small, separate, easy-to-review diff once this module exists to import from.
