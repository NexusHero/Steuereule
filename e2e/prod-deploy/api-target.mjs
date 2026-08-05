// What may `e2e/prod-deploy/run.mjs` honestly SAY about the far end of `API_ORIGIN`?
//
// WHY THIS FILE EXISTS. `run.mjs` attaches (`stack.mjs` ATTACH mode); it does not start the
// stack. Until this module existed it nonetheless printed the word **"containerised"** as a
// hardcoded literal in all four of its PASS lines — a claim about something on the other side of
// an HTTP origin that the script has no way to observe. Measured, against this very repo
// (2026-08-05, while writing #274's own test record): the script reported
//
//     [prod-deploy] PASS — guest flow reached Cockpit through the real containerised API.
//
// on a machine where the Docker daemon was **not running at all** and no container of any kind
// existed. The sentence was true in CI by coincidence — CI happens to `docker compose up` first —
// and false everywhere else. That is exactly ADR-0021's defect class with the sign flipped: not a
// control that passes when broken, but a *report* that asserts a fact its instrument cannot see.
// A convention ("this script is only ever run after compose") is a coincidence with a run-up.
//
// THE FIX IS DERIVATION, NOT A BETTER-CHOSEN WORD. The phrase is computed from an actual
// observation of the docker-compose.prod.yml project — `docker compose ps`, matched on service,
// running state, and the published host port `API_ORIGIN` actually names. Confirmed => the script
// may say "containerised" and name the container. Not confirmed, for ANY reason (no daemon, no
// project, wrong port, a remote origin, an unparseable payload) => it says what it does know: an
// origin that answered, and that what serves it was not established from here.
//
// FAIL-OPEN ON PURPOSE. This is a *description* of a passing run, never a gate: an unreachable
// Docker daemon must downgrade the wording, not fail the smoke test. `run.mjs`'s assertions are
// unchanged and remain the only thing that can turn this job red.
//
// SELF-CALIBRATION (ADR-0021 §3 — "an instrument gets a known-state calibration ... before its
// readings are used as evidence"): `node e2e/prod-deploy/api-target.mjs` runs the fixture A/B at
// the bottom of this file — inputs where the answer is known good and known bad — and exits
// non-zero if the two ever stop differing. Without it, a regression that made
// `describeApiTarget()` always return the confirmed phrase would be invisible in the one place
// this runs (CI, where a container really is there), which is how the original literal survived.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The compose service whose container must be behind `API_ORIGIN` for the "containerised"
 *  claim to hold, and the file pair that defines it — the same two `-f` flags `ci.yml`'s
 *  `prod-deploy-smoke` job and the README's own copy-paste command use. */
export const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.prod.yml']
export const API_SERVICE = 'api'

/** Only a loopback origin can possibly be served by a container published on THIS host. A
 *  remote `API_ORIGIN` (a preview deploy, a colleague's machine) with a local `api` container
 *  running on the same port would otherwise read as confirmed — a false positive assembled out
 *  of two unrelated true facts. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])

/**
 * Parses `docker compose ps --format json` output. Compose v2 emits newline-delimited JSON
 * objects; older v2 releases emit a single JSON array. Both shapes are accepted, and anything
 * else yields `[]` rather than throwing — an unreadable payload is "not established", which is
 * the honest answer, not a crash in the middle of a passing smoke run.
 */
export function parseComposePs(stdout) {
  const text = (stdout ?? '').trim()
  if (!text) return []
  try {
    if (text.startsWith('[')) {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    }
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

/**
 * The derivation, pure and independently testable: given the origin under test and whatever
 * `docker compose ps` said (or `null` when Docker could not be asked at all), return the phrases
 * `run.mjs` is entitled to print.
 *
 * Returns `{ containerConfirmed, apiPhrase, stackPhrase, note }`. `apiPhrase`/`stackPhrase` are
 * short enough to sit inside each of the five PASS lines without drowning them; `note` carries
 * the full reasoning and is printed ONCE, at the top of the run — the explanation belongs in the
 * report header, the qualifier belongs in every sentence that would otherwise overclaim.
 */
export function describeApiTarget(apiOrigin, composePsStdout) {
  const container = findPublishingContainer(apiOrigin, parseComposePs(composePsStdout))

  if (container) {
    return {
      containerConfirmed: true,
      apiPhrase: `the real containerised API (compose service "${API_SERVICE}", container ${container.name})`,
      stackPhrase: `the real docker-compose.prod.yml stack (api container ${container.name})`,
      note:
        `${apiOrigin} is published by a running docker-compose.prod.yml "${API_SERVICE}" container ` +
        `(${container.name}), observed via \`docker compose ps\` — so the PASS lines below may say ` +
        `"containerised" and name it.`,
    }
  }

  return {
    containerConfirmed: false,
    apiPhrase: `the API at ${apiOrigin} (unidentified)`,
    stackPhrase: `the stack behind ${apiOrigin} (unidentified)`,
    note:
      `"unidentified" means exactly this and nothing worse: no running docker-compose.prod.yml ` +
      `"${API_SERVICE}" container publishing ${apiOrigin} was observed from here, so what serves that ` +
      `origin is not established. This script ATTACHES to a stack it did not start — the flows below ` +
      `still ran for real against whatever answered; only the claim that it was a container is withheld.`,
  }
}

function findPublishingContainer(apiOrigin, entries) {
  let url
  try {
    url = new URL(apiOrigin)
  } catch {
    return null
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) return null
  const wantedPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80))

  for (const entry of entries) {
    if (entry?.Service !== API_SERVICE) continue
    if (entry?.State !== 'running') continue
    const publisher = (entry.Publishers ?? []).find((p) => Number(p?.PublishedPort) === wantedPort)
    if (!publisher) continue
    return { name: entry.Name ?? '(unnamed)' }
  }
  return null
}

/**
 * Asks Docker, or returns `null` if it cannot be asked. Never throws and never inherits stdio:
 * a missing binary, a stopped daemon and a compose project that does not exist are all the same
 * answer here ("not established"), and none of them may interrupt a smoke run that is otherwise
 * passing.
 */
export function probeComposePs({ cwd = REPO_ROOT, timeoutMs = 10_000 } = {}) {
  const args = COMPOSE_FILES.flatMap((file) => ['-f', file]).concat(['ps', '--format', 'json'])
  try {
    return execFileSync('docker', ['compose', ...args], {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/** The one call `run.mjs` makes: probe, then derive. */
export function resolveApiTarget(apiOrigin) {
  return describeApiTarget(apiOrigin, probeComposePs())
}

// --- Known-state calibration (ADR-0021 §3) ------------------------------------------------
// `node e2e/prod-deploy/api-target.mjs` — exits non-zero if the confirmed and unconfirmed
// branches ever stop discriminating. Wired into `prod-deploy-smoke` in ci.yml so it runs where
// the control runs.

const RUNNING_API_FIXTURE = JSON.stringify({
  Name: 'steuereule-api-1',
  Service: 'api',
  State: 'running',
  Publishers: [{ URL: '0.0.0.0', TargetPort: 3000, PublishedPort: 3000, Protocol: 'tcp' }],
})

const CALIBRATION = [
  {
    label: 'known good — running api container publishing the port API_ORIGIN names',
    apiOrigin: 'http://localhost:3000',
    stdout: RUNNING_API_FIXTURE,
    expectConfirmed: true,
  },
  {
    label: 'known bad — Docker could not be asked at all (no daemon / no binary)',
    apiOrigin: 'http://localhost:3000',
    stdout: null,
    expectConfirmed: false,
  },
  {
    label: 'known bad — compose project exists but nothing is running',
    apiOrigin: 'http://localhost:3000',
    stdout: '',
    expectConfirmed: false,
  },
  {
    label: 'known bad — an api container runs, but publishes a different port',
    apiOrigin: 'http://localhost:3000',
    stdout: JSON.stringify({
      Name: 'steuereule-api-1',
      Service: 'api',
      State: 'running',
      Publishers: [{ URL: '0.0.0.0', TargetPort: 3000, PublishedPort: 3999, Protocol: 'tcp' }],
    }),
    expectConfirmed: false,
  },
  {
    label: 'known bad — a local api container runs, but API_ORIGIN points somewhere else entirely',
    apiOrigin: 'http://api.example.com:3000',
    stdout: RUNNING_API_FIXTURE,
    expectConfirmed: false,
  },
]

export function runCalibration(log = console.log) {
  let failures = 0
  const phrases = new Set()
  for (const testCase of CALIBRATION) {
    const result = describeApiTarget(testCase.apiOrigin, testCase.stdout)
    phrases.add(result.apiPhrase)
    const ok = result.containerConfirmed === testCase.expectConfirmed
    if (!ok) failures += 1
    log(`[api-target] ${ok ? 'ok  ' : 'FAIL'} ${testCase.label}\n             -> ${result.apiPhrase}`)
  }
  if (phrases.size < 2) {
    log('[api-target] FAIL — every calibration input produced the SAME phrase; the derivation does not discriminate.')
    failures += 1
  }
  return failures
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const failures = runCalibration()
  const live = resolveApiTarget(process.env.API_ORIGIN ?? 'http://localhost:3000')
  console.log(`[api-target] live probe on this machine -> ${live.apiPhrase}`)
  console.log(`[api-target] live probe on this machine -> ${live.note}`)
  if (failures > 0) {
    console.error(`::error::api-target calibration failed on ${failures} case(s) — run.mjs's PASS lines cannot be trusted to describe what they ran against.`)
    process.exit(1)
  }
}
