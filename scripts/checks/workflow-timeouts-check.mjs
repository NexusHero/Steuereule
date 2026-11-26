// Every job in .github/workflows/*.yml must set `timeout-minutes` (#207). Without it a job that stops making
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

export function findViolations(dir) {
  const violations = []
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    for (const id of jobsWithoutTimeout(readFileSync(join(dir, file), 'utf8'))) violations.push(`${file}: job "${id}"`)
  }
  return violations
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findViolations(new URL('../../.github/workflows/', import.meta.url).pathname)
  if (violations.length > 0) {
    console.error(`workflow-timeouts-check: ${violations.length} job(s) without timeout-minutes (#207):`)
    for (const v of violations) console.error(`  - ${v}`)
    process.exit(1)
  }
  console.log('workflow-timeouts-check: every workflow job sets timeout-minutes')
}
