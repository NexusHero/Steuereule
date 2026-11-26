// Two rules for every job in .github/workflows/*.yml. It must set `timeout-minutes` (#207), and its own `if:` must
// not use `always()` (see jobsRunningWhenCancelled). Without it a job that stops making
// progress runs to GitHub's 6-hour default instead of failing fast. Plain Node, no YAML dependency: workflow job
// keys sit at two-space indent under `jobs:` and a job's own keys at four, which is all this needs to read.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Returns the ids of the jobs in one workflow source that set no `timeout-minutes`. */
export function jobsWithoutTimeout(source) {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l))
  if (start === -1) return []
  const jobs = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break // next top-level key ends the jobs block
    const id = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line)
    if (id) jobs.push({ id: id[1], timeout: false, reusable: false })
    else if (jobs.length > 0) {
      if (/^ {4}timeout-minutes:\s*\S/.test(line)) jobs[jobs.length - 1].timeout = true
      // A reusable-workflow call cannot carry timeout-minutes; the called workflow's jobs are checked there.
      if (/^ {4}uses:\s*\S/.test(line)) jobs[jobs.length - 1].reusable = true
    }
  }
  return jobs.filter((j) => !j.timeout && !j.reusable).map((j) => j.id)
}

/**
 * Returns the ids of the jobs whose own `if:` uses `always()`. Such a job also runs when the run was cancelled
 * (a newer push does that on every PR here), and one that then tests its `needs` reports a failed check for work
 * that was only cut short. `!cancelled()` runs after success and after failure, which is what those jobs want.
 */
export function jobsRunningWhenCancelled(source) {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l))
  if (start === -1) return []
  const found = []
  let job = null
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const id = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line)
    if (id) job = id[1]
    else if (job !== null && /^ {4}if:.*\balways\(\)/.test(line)) found.push(job)
  }
  return found
}

export function findViolations(dir) {
  const violations = []
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const source = readFileSync(join(dir, file), 'utf8')
    for (const id of jobsWithoutTimeout(source)) violations.push(`${file}: job "${id}" sets no timeout-minutes (#207)`)
    for (const id of jobsRunningWhenCancelled(source)) violations.push(`${file}: job "${id}" uses always() in its own if; use !cancelled()`)
  }
  return violations
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findViolations(new URL('../../.github/workflows/', import.meta.url).pathname)
  if (violations.length > 0) {
    console.error(`workflow-timeouts-check: ${violations.length} finding(s):`)
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log('workflow-timeouts-check: every workflow job sets timeout-minutes and none runs on a cancelled run')
}
