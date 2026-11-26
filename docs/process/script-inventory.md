# package.json script inventory — which scripts have no CI job behind them

Origin: #203 (ADR-0021's defect class: a script that looks like a gate and is not one, as `breakpoint-layout.mjs` was).
Taken against `main` at the time of writing. A script counts as *CI-backed* when a workflow step runs it by name
(`pnpm [--filter X] <script>`, `pnpm -r <script>`, `pnpm -r test --coverage`), runs the file it wraps, or an
`e2e/gates.json` gate does. Everything else is below, triaged:

- **(a)** dev/ops convenience, fine without CI
- **(b)** should be gated
- **(c)** dead, safe to delete

The e2e half of this is enforced from here on: `e2e/run-gates.test.mjs` fails when a script in `e2e/package.json` is
in no gate, no workflow step and not in its `NOT_IN_CI` list (with a reason). The root and workspace scripts are
re-read by hand; extend the check if that drifts.

## Scripts with no CI job of their own

| Script | Triage | Note |
|---|---|---|
| root `gate` | a | `pnpm -r typecheck && pnpm -r test`, the local pre-push shortcut. CI runs both steps itself. |
| root `build` (`turbo run build`) | a | CI builds the pieces it needs (`api build`, `expo export`). The tokens `dist/` is checked in and guarded by `packages/tokens/src/generated.test.ts`. `apps/website` `build` runs inside the Docker image build of the deploy workflow only. |
| root `coverage`, `*` `coverage` | a | CI runs the same thing through `pnpm -r test --coverage` (quality.yml, `test` job) with the thresholds. |
| `core` `test:watch` | a | watch mode |
| `core` `bench` | a | documented in README as local-only, no threshold to enforce |
| `api` `postinstall`, `mobile-web` `postinstall` | a | run by every `pnpm install` in CI, so they are exercised implicitly |
| `api` `skills:generate` | a | called by `build`, `test`, `test:integration`, `typecheck` |
| `api` `start` | a | `pnpm run build && node dist/main.js`; CI boots `node dist/main.js` itself (e2e stack, prod smoke) |
| `mobile-web` `start`, `web` | a | Expo dev server, used by `scripts/local.sh` |
| `mobile-web` `export:web` | a | CI calls `expo export --platform web` directly (ci.yml); the script is the same command |
| `api` `streets:fetch` | a | production data fetch, used by `scripts/local.sh` and the deploy runbook; the CI fixture never needs it |
| `api` `backfill:identity`, `rotate:field-key` | a | operator tools run in the migrate image (infra/README.md). Their logic is unit-tested in `apps/api/test`; a run against production data cannot be a CI job. |
| `api` `seed:year-history`, `seed:selbststaendig` | a | dev seeds, refuse `NODE_ENV=production`; type-checked by `tsconfig.check.json` |
| e2e `scenario:01` ... `scenario:24` | a | single-scenario debugging entry points; every one of them is imported by `e2e/scenarios/run-all-scenarios.mjs`, which CI runs in four shards |
| e2e `google-auth` | **b** | `e2e/google-auth/google-login.mjs` (REQ-008) is in no gate group and no workflow. See below. |

No script is (c) today.

## (b) Open items

1. **`e2e google-auth`** (`e2e/google-auth/google-login.mjs`, REQ-008, the Google sign-in plumbing). Not wired into
   `e2e/gates.json` in this pass: the script expects the API to be booted with Google credentials (the dev-only
   fallbacks in `apps/api/src/auth/better-auth-env.ts` may be enough), and nobody has proven it green against the
   CI stack. Wire it into the `account-and-session` group once a CI run shows it passing; the exemption in
   `e2e/run-gates.test.mjs` then fails on purpose and must be removed in the same change. Needs its own ticket.
