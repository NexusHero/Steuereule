#!/usr/bin/env node
// Fails on high/critical advisories in production dependencies (`pnpm audit --prod`).
//
// An advisory is accepted only when EVERY dependency path it was found on matches a rule in
// ALLOWLIST below. A rule has a reason and an expiry date; an expired rule fails the check, so an
// exception cannot outlive the review that granted it. Fix first (parent upgrade or
// `pnpm.overrides` in the root package.json), allowlist only what cannot be fixed.
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const ALLOWLIST = [
  {
    // pnpm audit lists the dependencies of the Expo app, which include its CLI and the Metro
    // bundler. They run in the build job that makes the static web export; the export
    // (and the web image) contains none of their code or node_modules.
    name: 'Expo / React Native build tooling',
    pattern: /^apps__mobile-web>(expo>@expo\/|expo>@react-native\/|react-native>@react-native\/|react-native>react-devtools-core)/,
    reason: 'Build-time only: Expo CLI and Metro run in CI, the web image ships the exported bundle only.',
    expires: '2027-02-28',
  },
  {
    // query-string 7 (via @react-navigation) needs decode-uri-component 0.2.x; the advisory is fixed
    // only from 0.5.1, which is ESM-only and breaks query-string (decodeComponent is not a function).
    // The input is the app's own URL query in the browser: a client-side CPU cost, no server path.
    name: 'decode-uri-component 0.2 via react-navigation',
    pattern: /^apps__mobile-web>@react-navigation\/native>@react-navigation\/core>query-string>decode-uri-component$/,
    reason: 'No fixed version in the 0.2 line; 0.5.x breaks query-string. Revisit when react-navigation moves to a newer query-string.',
    expires: '2027-02-28',
  },
  {
    // Prisma's config loader merges the project's own prisma.config; its input is the repository's file,
    // never request data. The fix is deepmerge-ts 8, a major jump inside Prisma's pinned CLI.
    name: 'deepmerge-ts inside the Prisma CLI',
    // Two paths: the adapter's own prisma, and the API's (a production dependency, the image migrates with it).
    pattern: /^apps__api>(@better-auth\/prisma-adapter>)?prisma>@prisma\/config>deepmerge-ts$/,
    reason: 'Not reachable with request data; a forced major would change Prisma 6.19 internals. Fixed with the next Prisma upgrade.',
    expires: '2027-02-28',
  },
  {
    // better-auth declares vitest as an optional peer; the workspace's own dev dependency satisfies
    // it, so the audit sees it. `pnpm install --prod` (the API image) does not install it.
    name: 'vitest as optional peer of better-auth',
    pattern: /^apps__api>better-auth>vitest(>|$)/,
    reason: 'Optional peer resolved from the workspace devDependency; not part of a production install.',
    expires: '2027-02-28',
  },
  {
    // style-dictionary turns the design tokens into files at build time (packages/tokens);
    // nothing imports it at runtime. The fix is the 5.x major, which changes the token build.
    name: 'style-dictionary token build',
    pattern: /^packages__tokens>style-dictionary(>|$)/,
    reason: 'Build-time token generation; fixed in style-dictionary 5.x, a major upgrade of the token build.',
    expires: '2027-02-28',
  },
]

const BLOCKING = new Set(['high', 'critical'])

/** Pure: which advisories block, given an audit report and the day it is judged on. */
export function evaluate(report, today = new Date().toISOString().slice(0, 10), allowlist = ALLOWLIST) {
  const blocking = []
  const accepted = new Map()
  const expired = allowlist.filter((rule) => rule.expires < today)

  for (const advisory of Object.values(report.advisories ?? {})) {
    if (!BLOCKING.has(advisory.severity)) continue
    const paths = advisory.findings.flatMap((finding) => finding.paths)
    const open = paths.filter((path) => !allowlist.some((rule) => rule.expires >= today && rule.pattern.test(path)))
    if (open.length > 0) {
      blocking.push({ id: advisory.github_advisory_id, module: advisory.module_name, severity: advisory.severity, patched: advisory.patched_versions, path: open[0] })
    } else {
      for (const path of paths) {
        const rule = allowlist.find((candidate) => candidate.pattern.test(path))
        if (rule) accepted.set(rule.name, (accepted.get(rule.name) ?? 0) + 1)
      }
    }
  }
  return { blocking, accepted, expired }
}

function main() {
  // pnpm is the repository's own package manager, found on PATH like every other command of the pipeline; the
  // arguments are fixed and no shell is involved.
  const run = spawnSync('pnpm', ['audit', '--prod', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) // NOSONAR javascript:S4036
  // pnpm exits non-zero whenever it finds anything; the JSON on stdout is the result.
  let report
  try {
    report = JSON.parse(run.stdout)
  } catch {
    console.error(`dependency-audit: pnpm audit gave no JSON (exit ${run.status}).\n${run.stderr}`)
    process.exit(2)
  }

  const { blocking, accepted, expired } = evaluate(report)
  for (const [name, count] of accepted) console.log(`accepted (${count} paths): ${name}`)
  for (const rule of expired) console.error(`allowlist rule expired ${rule.expires}: ${rule.name} — fix or renew with a new reason`)
  for (const item of blocking) {
    console.error(`${item.severity.toUpperCase()} ${item.id} ${item.module} (patched ${item.patched}) via ${item.path}`)
  }
  if (blocking.length > 0 || expired.length > 0) {
    console.error(`dependency-audit: ${blocking.length} blocking advisories, ${expired.length} expired rules.`)
    process.exit(1)
  }
  console.log('dependency-audit: no open high/critical advisories in production dependencies.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
