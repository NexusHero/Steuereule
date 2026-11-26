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
    // better-auth declares vitest as an optional peer; the workspace's own dev dependency satisfies
    // it, so the audit sees it. `pnpm install --prod` (the API image) does not install it.
    name: 'vitest as optional peer of better-auth',
    pattern: /^apps__api>better-auth>vitest(>|$)/,
    reason: 'Optional peer resolved from the workspace devDependency; not part of a production install.',
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
